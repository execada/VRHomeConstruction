package email

import "github.com/execada/VRHomeConstruction/backend/internal/config"

func NewSender(cfg *config.Config) Sender {
	switch {
	case cfg.ResendAPIKey != "":
		return NewResendSender(cfg.ResendAPIKey, cfg.ResendFrom)
	case cfg.BrevoAPIKey != "":
		return NewBrevoSender(cfg.BrevoAPIKey, cfg.BrevoFrom)
	default:
		return NewMailer(cfg.SMTP)
	}
}
