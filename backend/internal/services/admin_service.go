package services

import (
	"context"
	"errors"
	"fmt"
	"regexp"
	"strings"

	"github.com/execada/VRHomeConstruction/backend/internal/models"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"golang.org/x/crypto/bcrypt"
)

// ErrInvalidLogin — логин не подходит по формату.
var ErrInvalidLogin = errors.New("invalid login")

// loginPattern — логин администратора: 3–32 символа, латиница, цифры, «.», «_», «-».
var loginPattern = regexp.MustCompile(`^[a-z0-9][a-z0-9._-]{2,31}$`)

// AdminInput — данные команды create-admin.
type AdminInput struct {
	Login    string
	Email    string
	Name     string
	Password string
}

// adminUserRepository — хранилище пользователей для создания администратора.
type adminUserRepository interface {
	FindByUsername(ctx context.Context, username string) (*models.User, error)
	FindByEmail(ctx context.Context, email string) (*models.User, error)
	Insert(ctx context.Context, user *models.User) error
	UpdateCredentials(ctx context.Context, id, passwordHash, role string) (*models.User, error)
}

// CreateAdmin создаёт администратора, который входит по логину, или — если логин уже
// занят — задаёт ему новый пароль и роль администратора. created сообщает, что аккаунт новый.
func CreateAdmin(ctx context.Context, users adminUserRepository, in AdminInput) (*models.User, bool, error) {
	login, email, name, err := validateAdminInput(in)
	if err != nil {
		return nil, false, err
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(in.Password), bcrypt.DefaultCost)
	if err != nil {
		return nil, false, fmt.Errorf("hash password: %w", err)
	}

	existing, err := users.FindByUsername(ctx, login)
	if err != nil {
		return nil, false, fmt.Errorf("find admin: %w", err)
	}
	if existing != nil {
		updated, err := users.UpdateCredentials(ctx, existing.ID, string(hash), models.RoleAdmin)
		if err != nil {
			return nil, false, fmt.Errorf("update admin: %w", err)
		}
		return updated, false, nil
	}

	if email != "" {
		if taken, err := users.FindByEmail(ctx, email); err != nil {
			return nil, false, fmt.Errorf("find user by email: %w", err)
		} else if taken != nil {
			return nil, false, ErrUserAlreadyExists
		}
	}
	admin := &models.User{
		ID: primitive.NewObjectID().Hex(), Name: name, Email: email,
		Username: login, Role: models.RoleAdmin, PasswordHash: string(hash),
	}
	if err := users.Insert(ctx, admin); err != nil {
		return nil, false, fmt.Errorf("insert admin: %w", err)
	}
	return admin, true, nil
}

// validateAdminInput проверяет логин, почту (необязательна), имя и пароль.
func validateAdminInput(in AdminInput) (login, email, name string, err error) {
	login = normalizeLogin(in.Login)
	if !loginPattern.MatchString(login) {
		return "", "", "", newValidationError(ErrInvalidLogin,
			"login must be 3-32 characters: latin letters, digits, dot, dash or underscore")
	}
	if err := validatePassword(in.Password); err != nil {
		return "", "", "", err
	}
	if raw := strings.TrimSpace(in.Email); raw != "" {
		email = normalizeEmail(raw)
		if err := validateEmailFormat(email); err != nil {
			return "", "", "", err
		}
	}
	name = strings.TrimSpace(in.Name)
	if name == "" {
		name = login
	}
	if name, err = normalizeName(name, maxUserNameLen); err != nil {
		return "", "", "", err
	}
	return login, email, name, nil
}

func normalizeLogin(login string) string {
	return strings.ToLower(strings.TrimSpace(login))
}
