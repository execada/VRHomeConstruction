package email

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/mail"
	"time"
)

const (
	brevoEndpoint = "https://api.brevo.com/v3/smtp/email"
	brevoTimeout  = 15 * time.Second
	brevoMaxBody  = 64 << 10
)

// BrevoSender отправляет коды через HTTPS API Brevo — работает и там, где хостинг
// закрыл исходящий SMTP. Отправитель должен быть подтверждён в Brevo (свой домен не нужен).
type BrevoSender struct {
	apiKey   string
	from     string
	endpoint string
	client   *http.Client
}

func NewBrevoSender(apiKey, from string) *BrevoSender {
	return &BrevoSender{
		apiKey:   apiKey,
		from:     from,
		endpoint: brevoEndpoint,
		client:   &http.Client{Timeout: brevoTimeout},
	}
}

type brevoContact struct {
	Name  string `json:"name,omitempty"`
	Email string `json:"email"`
}

type brevoMessage struct {
	Sender      brevoContact   `json:"sender"`
	To          []brevoContact `json:"to"`
	Subject     string         `json:"subject"`
	TextContent string         `json:"textContent"`
}

func (b *BrevoSender) SendVerificationCode(to, code, purposeLabel string) error {
	if err := validRecipient(to); err != nil {
		return err
	}
	sender, err := mail.ParseAddress(b.from)
	if err != nil {
		return fmt.Errorf("brevo sender: invalid BREVO_FROM: %w", err)
	}
	body, err := json.Marshal(brevoMessage{
		Sender:      brevoContact{Name: sender.Name, Email: sender.Address},
		To:          []brevoContact{{Email: to}},
		Subject:     "Код подтверждения — VR Home Construction",
		TextContent: fmt.Sprintf("Здравствуйте!\n\nВаш код для %s: %s\n\nКод действителен 10 минут. Если вы не запрашивали код, проигнорируйте это письмо.\n", purposeLabel, code),
	})
	if err != nil {
		return fmt.Errorf("brevo payload: %w", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), brevoTimeout)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, b.endpoint, bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("brevo request: %w", err)
	}
	req.Header.Set("api-key", b.apiKey)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")

	res, err := b.client.Do(req)
	if err != nil {
		return fmt.Errorf("brevo request: %w", err)
	}
	defer func() {
		_, _ = io.Copy(io.Discard, io.LimitReader(res.Body, brevoMaxBody))
		_ = res.Body.Close()
	}()

	if res.StatusCode >= http.StatusBadRequest {
		var errBody struct {
			Message string `json:"message"`
		}
		_ = json.NewDecoder(io.LimitReader(res.Body, brevoMaxBody)).Decode(&errBody)
		msg := errBody.Message
		if msg == "" {
			msg = res.Status
		}
		return fmt.Errorf("brevo api: %s", msg)
	}

	log.Printf("[BREVO OK] code sent to %s", MaskAddress(to))
	return nil
}

func (b *BrevoSender) LogOnly() bool {
	return false
}

var _ Sender = (*BrevoSender)(nil)
