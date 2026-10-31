package email

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"time"
)

const (
	resendEndpoint = "https://api.resend.com/emails"
	resendTimeout  = 15 * time.Second
	// Сколько тела ответа читать (ошибка + слив остатка для переиспользования соединения).
	resendMaxBody = 64 << 10
)

type ResendSender struct {
	apiKey   string
	from     string
	endpoint string
	client   *http.Client
}

func NewResendSender(apiKey, from string) *ResendSender {
	if from == "" {
		from = "VR Home <onboarding@resend.dev>"
	}
	return &ResendSender{
		apiKey:   apiKey,
		from:     from,
		endpoint: resendEndpoint,
		client:   &http.Client{Timeout: resendTimeout},
	}
}

func (r *ResendSender) SendVerificationCode(to, code, purposeLabel string) error {
	if err := validRecipient(to); err != nil {
		return err
	}
	body, err := json.Marshal(map[string]interface{}{
		"from":    r.from,
		"to":      []string{to},
		"subject": "Код подтверждения — VR Home Construction",
		"text":    fmt.Sprintf("Здравствуйте!\n\nВаш код для %s: %s\n\nКод действителен 10 минут.\n", purposeLabel, code),
	})
	if err != nil {
		return fmt.Errorf("resend payload: %w", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), resendTimeout)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, r.endpoint, bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("resend request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+r.apiKey)
	req.Header.Set("Content-Type", "application/json")

	res, err := r.client.Do(req)
	if err != nil {
		return fmt.Errorf("resend request: %w", err)
	}
	defer func() {
		_, _ = io.Copy(io.Discard, io.LimitReader(res.Body, resendMaxBody))
		_ = res.Body.Close()
	}()

	if res.StatusCode >= http.StatusBadRequest {
		var errBody struct {
			Message string `json:"message"`
		}
		_ = json.NewDecoder(io.LimitReader(res.Body, resendMaxBody)).Decode(&errBody)
		msg := errBody.Message
		if msg == "" {
			msg = res.Status
		}
		return fmt.Errorf("resend api: %s", msg)
	}

	log.Printf("[RESEND OK] code sent to %s", MaskAddress(to))
	return nil
}

func (r *ResendSender) LogOnly() bool {
	return false
}

var _ Sender = (*ResendSender)(nil)
