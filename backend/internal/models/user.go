package models

// RoleAdmin — администратор (создаётся командой create-admin, входит по логину).
const RoleAdmin = "admin"

type User struct {
	ID   string `json:"-" bson:"_id"`
	Name string `json:"name" bson:"name"`
	// Email может отсутствовать у администратора, который входит по логину.
	Email string `json:"email" bson:"email,omitempty"`
	// Username — логин для входа вместо почты (только у созданных командой create-admin).
	Username     string  `json:"-" bson:"username,omitempty"`
	Role         string  `json:"-" bson:"role,omitempty"`
	PasswordHash string  `json:"-" bson:"passwordHash"`
	Avatar       *string `json:"avatar,omitempty" bson:"avatar,omitempty"`
	// TokenVersion — версия сессий: попадает в JWT и растёт при сбросе пароля, после чего
	// выданные раньше токены не принимаются (у старых документов поля нет — версия 0).
	TokenVersion int64 `json:"-" bson:"tokenVersion,omitempty"`
}

// UserPublic is the API representation expected by the frontend (id, not _id).
type UserPublic struct {
	ID       string  `json:"id"`
	Name     string  `json:"name"`
	Email    string  `json:"email"`
	Username string  `json:"username,omitempty"`
	Role     string  `json:"role,omitempty"`
	Avatar   *string `json:"avatar,omitempty"`
}

func (u *User) ToPublic() UserPublic {
	return UserPublic{
		ID:       u.ID,
		Name:     u.Name,
		Email:    u.Email,
		Username: u.Username,
		Role:     u.Role,
		Avatar:   u.Avatar,
	}
}

// LoginRequest — вход по почте или по логину администратора (поле email принимает оба).
type LoginRequest struct {
	Email    string `json:"email" binding:"required,max=254"`
	Password string `json:"password" binding:"required,max=128"`
}

type AuthResponse struct {
	User  UserPublic `json:"user"`
	Token string     `json:"token"`
}

// UpdateProfileRequest — тело PATCH /api/auth/me (длину имени проверяет сервис).
type UpdateProfileRequest struct {
	Name string `json:"name"`
}

// UserResponse — ответ {user} без нового токена (например, после смены email).
type UserResponse struct {
	User UserPublic `json:"user"`
}
