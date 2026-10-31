package email

import (
	"crypto/tls"
	"errors"
	"fmt"
	"log"
	"net"
	"net/smtp"
	"strings"
	"time"

	"github.com/execada/VRHomeConstruction/backend/internal/config"
)

const smtpTimeout = 25 * time.Second

// errInvalidRecipient — адрес с переводом строки мог бы дописать заголовки письма.
var errInvalidRecipient = errors.New("invalid recipient address")

// validRecipient отсекает адреса, которыми можно внедрить заголовки (CR/LF).
func validRecipient(to string) error {
	if to == "" || strings.ContainsAny(to, "\r\n") {
		return errInvalidRecipient
	}
	return nil
}

// isLocalSMTP — локальный SMTP (MailHog и т.п.): там допустима работа без TLS.
func isLocalSMTP(host string) bool {
	return host == "localhost" || host == "127.0.0.1" || host == "::1"
}

type Mailer struct {
	cfg config.SMTPConfig
}

func NewMailer(cfg config.SMTPConfig) *Mailer {
	return &Mailer{cfg: cfg}
}

func (m *Mailer) LogOnly() bool {
	return m.cfg.LogOnly || !m.cfg.Enabled
}

// Ensure Mailer implements Sender.
var _ Sender = (*Mailer)(nil)

func (m *Mailer) SendVerificationCode(to, code, purposeLabel string) error {
	if err := validRecipient(to); err != nil {
		return err
	}
	subject := "Код подтверждения — VR Home Construction"
	body := fmt.Sprintf(
		"Здравствуйте!\n\nВаш код для %s: %s\n\nКод действителен 10 минут. Если вы не запрашивали код, проигнорируйте это письмо.\n",
		purposeLabel,
		code,
	)

	// Режим «только логи» — для разработки без почты: код печатается в консоль.
	// В production сервер с ним не стартует (config.Validate).
	if !m.cfg.Enabled || m.cfg.LogOnly {
		log.Printf("[CODE] to=%s purpose=%s code=%s (SMTP_LOG_ONLY)", MaskAddress(to), purposeLabel, code)
		return nil
	}

	from := m.cfg.From
	if from == "" {
		from = m.cfg.User
	}

	msg := strings.Join([]string{
		"From: " + from,
		"To: " + to,
		"Subject: " + subject,
		"MIME-Version: 1.0",
		"Content-Type: text/plain; charset=UTF-8",
		"",
		body,
	}, "\r\n")

	var err error
	if m.cfg.Port == "465" {
		err = m.sendTLS465(from, to, []byte(msg))
	} else {
		err = m.sendSTARTTLS(from, to, []byte(msg))
	}

	if err != nil {
		return fmt.Errorf("smtp send to %s: %w", MaskAddress(to), err)
	}

	log.Printf("[EMAIL OK] code sent to %s", MaskAddress(to))
	return nil
}

// sendTLS465 — Gmail SSL (порт 465), часто работает при блокировке 587.
func (m *Mailer) sendTLS465(from, to string, msg []byte) error {
	addr := net.JoinHostPort(m.cfg.Host, m.cfg.Port)
	tlsConfig := &tls.Config{ServerName: m.cfg.Host, MinVersion: tls.VersionTLS12}

	conn, err := tls.DialWithDialer(&net.Dialer{Timeout: smtpTimeout}, "tcp", addr, tlsConfig)
	if err != nil {
		return fmt.Errorf("tls dial %s: %w", addr, err)
	}
	defer conn.Close()

	_ = conn.SetDeadline(time.Now().Add(smtpTimeout))

	client, err := smtp.NewClient(conn, m.cfg.Host)
	if err != nil {
		return fmt.Errorf("smtp client: %w", err)
	}
	defer client.Close()

	return m.deliver(client, from, to, msg)
}

func (m *Mailer) sendSTARTTLS(from, to string, msg []byte) error {
	addr := net.JoinHostPort(m.cfg.Host, m.cfg.Port)

	conn, err := net.DialTimeout("tcp", addr, smtpTimeout)
	if err != nil {
		return fmt.Errorf("dial %s: %w", addr, err)
	}
	defer conn.Close()

	_ = conn.SetDeadline(time.Now().Add(smtpTimeout))

	client, err := smtp.NewClient(conn, m.cfg.Host)
	if err != nil {
		return fmt.Errorf("smtp client: %w", err)
	}
	defer client.Close()

	// Без шифрования код и пароль ушли бы открытым текстом — допустимо только локально.
	if ok, _ := client.Extension("STARTTLS"); ok {
		tlsConfig := &tls.Config{ServerName: m.cfg.Host, MinVersion: tls.VersionTLS12}
		if err = client.StartTLS(tlsConfig); err != nil {
			return fmt.Errorf("starttls: %w", err)
		}
	} else if !isLocalSMTP(m.cfg.Host) {
		return errors.New("smtp server does not offer STARTTLS")
	}

	return m.deliver(client, from, to, msg)
}

func (m *Mailer) deliver(client *smtp.Client, from, to string, msg []byte) error {
	auth := smtp.PlainAuth("", m.cfg.User, m.cfg.Password, m.cfg.Host)
	if err := client.Auth(auth); err != nil {
		return fmt.Errorf("smtp auth: %w", err)
	}

	if err := client.Mail(from); err != nil {
		return fmt.Errorf("smtp mail from: %w", err)
	}
	if err := client.Rcpt(to); err != nil {
		return fmt.Errorf("smtp rcpt: %w", err)
	}

	w, err := client.Data()
	if err != nil {
		return fmt.Errorf("smtp data: %w", err)
	}
	if _, err = w.Write(msg); err != nil {
		return fmt.Errorf("smtp write: %w", err)
	}
	if err = w.Close(); err != nil {
		return fmt.Errorf("smtp data close: %w", err)
	}
	if err := client.Quit(); err != nil {
		return fmt.Errorf("smtp quit: %w", err)
	}
	return nil
}
