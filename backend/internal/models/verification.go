package models

import "time"

// Коды подтверждения нужны для проверки владения почтой: при регистрации и при
// смене email (код уходит на новый адрес). Вход выполняется сразу по email+паролю.
const (
	VerificationPurposeRegister    = "register"
	VerificationPurposeChangeEmail = "change_email"
)

type SendCodeRequest struct {
	Email    string `json:"email" binding:"required,email,max=254"`
	Purpose  string `json:"purpose" binding:"required,oneof=register"`
	Name     string `json:"name"`
	Password string `json:"password"`
}

type VerifyCodeRequest struct {
	Email   string `json:"email" binding:"required,email,max=254"`
	Code    string `json:"code" binding:"required,len=6"`
	Purpose string `json:"purpose" binding:"required,oneof=register"`
	// Token выдаётся при отправке кода и привязывает подтверждение к тому, кто задал
	// пароль: перезаписавший незавершённую регистрацию не сможет ей воспользоваться.
	Token string `json:"token" binding:"required,max=128"`
}

type SendCodeResponse struct {
	Message string `json:"message"`
	Token   string `json:"token,omitempty"`
}

// EmailChangeCodeRequest — тело POST /api/auth/email/send-code (формат проверяет сервис).
type EmailChangeCodeRequest struct {
	NewEmail string `json:"newEmail"`
	// Password — текущий пароль: с украденным токеном нельзя увести аккаунт сменой почты.
	Password string `json:"password"`
}

// EmailChangeVerifyRequest — тело POST /api/auth/email/verify.
type EmailChangeVerifyRequest struct {
	NewEmail string `json:"newEmail"`
	Code     string `json:"code" binding:"required,len=6"`
}

type VerificationRecord struct {
	ID           string    `bson:"_id"`
	Email        string    `bson:"email"`
	Purpose      string    `bson:"purpose"`
	CodeHash     string    `bson:"codeHash"`
	ExpiresAt    time.Time `bson:"expiresAt"`
	LastSentAt   time.Time `bson:"lastSentAt"`
	Attempts     int       `bson:"attempts"`
	Name         string    `bson:"name,omitempty"`
	PasswordHash string    `bson:"passwordHash,omitempty"`
	// UserID — кто запросил смену email (только для purpose=change_email).
	UserID string `bson:"userId,omitempty"`
	// TokenHash — SHA-256 токена регистрации (только для purpose=register).
	TokenHash string `bson:"tokenHash,omitempty"`
}

// VerificationKey — по каким полям ищется запись кода. Пустые UserID/TokenHash
// в поиске не участвуют.
type VerificationKey struct {
	Email     string
	Purpose   string
	UserID    string
	TokenHash string
}
