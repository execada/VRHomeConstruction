package main

import (
	"bufio"
	"context"
	"errors"
	"flag"
	"fmt"
	"io"
	"os"
	"strings"
	"time"

	"github.com/execada/VRHomeConstruction/backend/internal/config"
	"github.com/execada/VRHomeConstruction/backend/internal/database"
	"github.com/execada/VRHomeConstruction/backend/internal/repositories"
	"github.com/execada/VRHomeConstruction/backend/internal/services"
	"golang.org/x/term"
)

const adminCommandTimeout = 30 * time.Second

// adminArgs — параметры команды create-admin.
type adminArgs struct {
	login, email, name string
}

// parseAdminArgs разбирает флаги create-admin; логин обязателен.
func parseAdminArgs(args []string, out io.Writer) (adminArgs, error) {
	fs := flag.NewFlagSet("create-admin", flag.ContinueOnError)
	fs.SetOutput(out)
	login := fs.String("login", "", "логин для входа: 3–32 символа, латиница, цифры, «.», «_», «-»")
	email := fs.String("email", "", "почта (необязательно)")
	name := fs.String("name", "", "имя (по умолчанию — логин)")
	if err := fs.Parse(args); err != nil {
		return adminArgs{}, err
	}
	if strings.TrimSpace(*login) == "" {
		return adminArgs{}, errors.New("укажите --login")
	}
	return adminArgs{login: *login, email: *email, name: *name}, nil
}

// readPassword читает пароль: в терминале — скрыто и дважды, иначе — первую строку stdin.
func readPassword(in *os.File, out io.Writer) (string, error) {
	fd := int(in.Fd())
	if !term.IsTerminal(fd) {
		line, err := bufio.NewReader(in).ReadString('\n')
		if err != nil && !errors.Is(err, io.EOF) {
			return "", fmt.Errorf("read password: %w", err)
		}
		return strings.TrimRight(line, "\r\n"), nil
	}
	ask := func(prompt string) (string, error) {
		fmt.Fprint(out, prompt)
		p, err := term.ReadPassword(fd)
		fmt.Fprintln(out)
		return string(p), err
	}
	first, err := ask("Пароль: ")
	if err != nil {
		return "", fmt.Errorf("read password: %w", err)
	}
	second, err := ask("Повторите пароль: ")
	if err != nil {
		return "", fmt.Errorf("read password: %w", err)
	}
	if first != second {
		return "", errors.New("пароли не совпадают")
	}
	return first, nil
}

// runCreateAdmin — команда create-admin: создаёт администратора с входом по логину
// или задаёт существующему новый пароль. Пароль в аргументы не передаётся.
//
//	vrhome-server create-admin --login execada [--email you@example.com] [--name "Имя"]
func runCreateAdmin(args []string, in *os.File, out io.Writer) error {
	parsed, err := parseAdminArgs(args, out)
	if err != nil {
		return err
	}
	password, err := readPassword(in, out)
	if err != nil {
		return err
	}

	client, err := database.Connect(config.Load().MongoURI)
	if err != nil {
		return fmt.Errorf("connect to MongoDB: %w", err)
	}
	defer disconnect(client)
	ctx, cancel := context.WithTimeout(context.Background(), adminCommandTimeout)
	defer cancel()

	db := client.Database(database.Name)
	if err := database.EnsureIndexes(ctx, db); err != nil {
		return fmt.Errorf("ensure MongoDB indexes: %w", err)
	}
	user, created, err := services.CreateAdmin(ctx, repositories.NewUserRepo(db), services.AdminInput{
		Login: parsed.login, Email: parsed.email, Name: parsed.name, Password: password,
	})
	if err != nil {
		return err
	}
	if created {
		fmt.Fprintf(out, "Администратор %s создан — входите с этим логином и паролем.\n", user.Username)
	} else {
		fmt.Fprintf(out, "Администратору %s задан новый пароль.\n", user.Username)
	}
	return nil
}
