package services

import (
	"context"
	"errors"
	"strings"
	"testing"

	"github.com/execada/VRHomeConstruction/backend/internal/models"
	"golang.org/x/crypto/bcrypt"
)

func TestCreateAdminCreatesLoginAccount(t *testing.T) {
	users := newFakeUserRepo()

	user, created, err := CreateAdmin(context.Background(), users, AdminInput{Login: "  ExecAda ", Password: "admin-pass"})
	if err != nil || !created {
		t.Fatalf("CreateAdmin: created=%v err=%v", created, err)
	}
	if user.Username != "execada" || user.Role != models.RoleAdmin || user.Email != "" || user.Name != "execada" {
		t.Fatalf("unexpected admin %+v", user)
	}
	if bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte("admin-pass")) != nil {
		t.Fatal("the password must be stored as a bcrypt hash")
	}
	if users.byUsername["execada"] == nil {
		t.Fatal("the admin must be persisted")
	}
}

func TestCreateAdminResetsExistingAdmin(t *testing.T) {
	users := newFakeUserRepo()
	ctx := context.Background()
	first, _, err := CreateAdmin(ctx, users, AdminInput{Login: "execada", Email: "Owner@Example.com", Name: "Владелец", Password: "first-pass"})
	if err != nil {
		t.Fatalf("create: %v", err)
	}

	second, created, err := CreateAdmin(ctx, users, AdminInput{Login: "EXECADA", Password: "second-pass"})
	if err != nil || created {
		t.Fatalf("a second run must update, got created=%v err=%v", created, err)
	}
	if second.ID != first.ID || second.Email != "owner@example.com" || second.Role != models.RoleAdmin {
		t.Fatalf("the same account must keep its data, got %+v", second)
	}
	if bcrypt.CompareHashAndPassword([]byte(second.PasswordHash), []byte("second-pass")) != nil {
		t.Fatal("the password must be reset")
	}
}

func TestCreateAdminValidation(t *testing.T) {
	cases := map[string]AdminInput{
		"short login":    {Login: "ab", Password: "admin-pass"},
		"long login":     {Login: strings.Repeat("a", 33), Password: "admin-pass"},
		"login with @":   {Login: "exec@ada", Password: "admin-pass"},
		"login space":    {Login: "exec ada", Password: "admin-pass"},
		"cyrillic login": {Login: "админ", Password: "admin-pass"},
		"short password": {Login: "execada", Password: "12345"},
		"long password":  {Login: "execada", Password: strings.Repeat("a", maxPasswordBytes+1)},
		"invalid email":  {Login: "execada", Email: "not-an-email", Password: "admin-pass"},
		"name too long":  {Login: "execada", Name: strings.Repeat("я", maxUserNameLen+1), Password: "admin-pass"},
	}
	for name, in := range cases {
		t.Run(name, func(t *testing.T) {
			users := newFakeUserRepo()
			if _, _, err := CreateAdmin(context.Background(), users, in); err == nil {
				t.Fatal("expected a validation error")
			}
			if len(users.byID) != 0 {
				t.Fatal("nothing must be stored")
			}
		})
	}
}

func TestCreateAdminRejectsForeignEmail(t *testing.T) {
	users := newFakeUserRepo()
	users.byEmail["taken@example.com"] = &models.User{ID: "u1", Email: "taken@example.com"}
	users.byID["u1"] = users.byEmail["taken@example.com"]

	_, _, err := CreateAdmin(context.Background(), users, AdminInput{Login: "execada", Email: "taken@example.com", Password: "admin-pass"})
	if err != ErrUserAlreadyExists {
		t.Fatalf("an email of another user must be rejected, got %v", err)
	}
}

func TestCreateAdminPropagatesStorageErrors(t *testing.T) {
	boom := errors.New("db down")
	users := newFakeUserRepo()
	users.findByUsernameErr = boom
	if _, _, err := CreateAdmin(context.Background(), users, AdminInput{Login: "execada", Password: "admin-pass"}); !errors.Is(err, boom) {
		t.Fatalf("expected the storage error, got %v", err)
	}
}

func TestLoginByUsername(t *testing.T) {
	svc, users, _ := newAuthService()
	if _, _, err := CreateAdmin(context.Background(), users, AdminInput{Login: "execada", Password: "admin-pass"}); err != nil {
		t.Fatalf("create admin: %v", err)
	}
	ctx := context.Background()

	resp, err := svc.Login(ctx, models.LoginRequest{Email: " ExecAda ", Password: "admin-pass"})
	if err != nil {
		t.Fatalf("login by username: %v", err)
	}
	if resp.User.Username != "execada" || resp.User.Role != models.RoleAdmin || resp.Token == "" {
		t.Fatalf("unexpected login response %+v", resp.User)
	}
	if _, err := svc.Login(ctx, models.LoginRequest{Email: "execada", Password: "wrong-pass"}); err != ErrInvalidCredentials {
		t.Fatalf("wrong password: expected ErrInvalidCredentials, got %v", err)
	}
	if _, err := svc.Login(ctx, models.LoginRequest{Email: "nobody", Password: "admin-pass"}); err != ErrInvalidCredentials {
		t.Fatalf("unknown login: expected ErrInvalidCredentials, got %v", err)
	}
}
