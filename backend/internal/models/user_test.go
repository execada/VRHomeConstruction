package models

import "testing"

func TestUserToPublicOmitsPasswordHash(t *testing.T) {
	avatar := "https://example.com/a.png"
	u := User{
		ID:           "user-1",
		Name:         "Иван",
		Email:        "ivan@example.com",
		PasswordHash: "secret-hash",
		Avatar:       &avatar,
	}

	pub := u.ToPublic()

	if pub.ID != u.ID {
		t.Errorf("expected id %q, got %q", u.ID, pub.ID)
	}
	if pub.Name != u.Name {
		t.Errorf("expected name %q, got %q", u.Name, pub.Name)
	}
	if pub.Email != u.Email {
		t.Errorf("expected email %q, got %q", u.Email, pub.Email)
	}
	if pub.Avatar == nil || *pub.Avatar != avatar {
		t.Errorf("expected avatar to be preserved, got %v", pub.Avatar)
	}
	// UserPublic не содержит поля PasswordHash — это гарантируется типом на этапе компиляции.
}

func TestUserToPublicExposesLoginAndRole(t *testing.T) {
	u := &User{ID: "a1", Name: "Админ", Username: "execada", Role: RoleAdmin, PasswordHash: "secret"}
	pub := u.ToPublic()
	if pub.Username != "execada" || pub.Role != RoleAdmin || pub.Email != "" {
		t.Fatalf("unexpected public user %+v", pub)
	}
}
