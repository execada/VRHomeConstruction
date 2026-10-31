package email

// Sender отправляет код подтверждения.
type Sender interface {
	SendVerificationCode(to, code, purposeLabel string) error
	LogOnly() bool
}
