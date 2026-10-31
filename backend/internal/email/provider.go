package email

import "github.com/execada/VRHomeConstruction/backend/internal/config"

func NewSender(cfg *config.Config) Sender {
	if cfg.ResendAPIKey != "" {
		return NewResendSender(cfg.ResendAPIKey, cfg.ResendFrom)
	}
	return NewMailer(cfg.SMTP)
}
