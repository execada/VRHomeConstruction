package config

import (
	"crypto/rand"
	"encoding/base64"
	"errors"
	"fmt"
	"log"
	"os"
	"strings"
)

// Режимы окружения (APP_ENV).
const (
	EnvDevelopment = "development"
	EnvProduction  = "production"
)

// legacyDevJWTSecret — публичное dev-значение прошлых версий. Им подписать токен может
// кто угодно, поэтому оно не принимается ни в каком режиме.
const legacyDevJWTSecret = "dev-jwt-secret-change-in-production"

const (
	minJWTSecretBytes = 32
	// Минимум различных символов: отсекает заглушки вида "xxxx…" или "change-me-change-me…".
	minJWTSecretDistinct = 10
)

type Config struct {
	Env       string // EnvDevelopment | EnvProduction (APP_ENV)
	Port      string
	MongoURI  string
	JWTSecret string
	// JWTSecretGenerated — dev-режим без JWT_SECRET: секрет случайный, токены живут до перезапуска.
	JWTSecretGenerated bool
	// AllowedOrigins — origin-ы для CORS; ["*"] — всем (только dev), пусто — CORS выключен (тот же origin).
	AllowedOrigins []string
	// TrustedProxies — IP/CIDR прокси, которым верим в X-Forwarded-For (иначе клиент — адрес соединения).
	TrustedProxies []string
	SMTP           SMTPConfig
	ResendAPIKey   string
	ResendFrom     string
	// Brevo — отправка через HTTPS API (работает, когда хостинг закрыл исходящий SMTP);
	// BrevoFrom — подтверждённый в Brevo отправитель: «Имя <адрес>» или просто адрес.
	BrevoAPIKey string
	BrevoFrom   string
	// AllowLogOnlyMail — явное решение оператора запустить production без почты:
	// коды подтверждения пишутся в лог (временно, пока не подключена отправка).
	AllowLogOnlyMail bool
}

func (c *Config) IsProduction() bool {
	return c.Env == EnvProduction
}

type SMTPConfig struct {
	Host     string
	Port     string
	User     string
	Password string
	From     string
	Enabled  bool
	LogOnly  bool
}

// MailConfigured — настроена настоящая отправка писем (Resend, Brevo или SMTP не в режиме логов).
func (c *Config) MailConfigured() bool {
	return c.ResendAPIKey != "" || c.BrevoAPIKey != "" || c.SMTP.Enabled
}

func Load() *Config {
	env := parseEnv(os.Getenv("APP_ENV"))
	cfg := &Config{
		Env:            env,
		Port:           envOr("PORT", "8080"),
		MongoURI:       envOr("MONGO_URI", "mongodb://localhost:27017"),
		JWTSecret:      strings.TrimSpace(os.Getenv("JWT_SECRET")),
		AllowedOrigins: splitList(os.Getenv("ALLOWED_ORIGINS")),
		TrustedProxies: splitList(os.Getenv("TRUSTED_PROXIES")),
		ResendAPIKey:   os.Getenv("RESEND_API_KEY"),
		ResendFrom:     envOr("RESEND_FROM", "VR Home <onboarding@resend.dev>"),
		BrevoAPIKey:    strings.TrimSpace(os.Getenv("BREVO_API_KEY")),
		BrevoFrom:      strings.TrimSpace(os.Getenv("BREVO_FROM")),
		SMTP:           loadSMTP(),
		// Только явное true/1: опечатка не должна включать коды в логах.
		AllowLogOnlyMail: isTrue(os.Getenv("ALLOW_LOG_ONLY_MAIL")),
	}

	// В dev без CORS-списка разрешаем всех (удобно для локальной разработки);
	// в production пустой список означает «только тот же origin».
	if len(cfg.AllowedOrigins) == 0 && env == EnvDevelopment {
		cfg.AllowedOrigins = []string{"*"}
	}

	// Dev без секрета (или со старым публичным значением): случайный секрет на время работы процесса.
	if env == EnvDevelopment && (cfg.JWTSecret == "" || cfg.JWTSecret == legacyDevJWTSecret) {
		if secret, err := randomSecret(); err == nil {
			if cfg.JWTSecret != "" {
				log.Println("WARN: JWT_SECRET равен старому публичному dev-значению — используется случайный секрет до перезапуска")
			}
			cfg.JWTSecret = secret
			cfg.JWTSecretGenerated = true
		}
	}
	return cfg
}

// Validate проверяет конфигурацию перед стартом. Ошибка — сервер не должен запускаться.
func (c *Config) Validate() error {
	var problems []string
	if err := checkJWTSecret(c.JWTSecret); err != nil {
		problems = append(problems, err.Error())
	}
	if c.BrevoAPIKey != "" && c.BrevoFrom == "" {
		problems = append(problems, "для BREVO_API_KEY нужен BREVO_FROM — подтверждённый в Brevo адрес отправителя")
	}
	if c.IsProduction() {
		if !c.MailConfigured() && !c.AllowLogOnlyMail {
			problems = append(problems, "в production нужна настоящая почта (RESEND_API_KEY или SMTP_* без SMTP_LOG_ONLY) — иначе коды подтверждения попадали бы в логи")
		}
		for _, o := range c.AllowedOrigins {
			if o == "*" {
				problems = append(problems, "в production ALLOWED_ORIGINS не может быть «*»")
			}
		}
	}
	if len(problems) > 0 {
		return errors.New("некорректная конфигурация: " + strings.Join(problems, "; "))
	}
	return nil
}

// checkJWTSecret — секрет подписи токенов должен быть длинным и не похожим на заглушку.
func checkJWTSecret(secret string) error {
	switch {
	case secret == "":
		return errors.New("JWT_SECRET не задан")
	case secret == legacyDevJWTSecret:
		return errors.New("JWT_SECRET равен публичному dev-значению")
	case len(secret) < minJWTSecretBytes:
		return fmt.Errorf("JWT_SECRET короче %d байт", minJWTSecretBytes)
	case distinctRunes(secret) < minJWTSecretDistinct:
		return errors.New("JWT_SECRET похож на заглушку — сгенерируйте случайный (openssl rand -base64 48)")
	}
	return nil
}

func isTrue(raw string) bool {
	switch strings.ToLower(strings.TrimSpace(raw)) {
	case "1", "true":
		return true
	}
	return false
}

// parseEnv: пусто/development/dev/local — разработка; любое другое значение — production
// (опечатка вроде «Production» не должна молча включать dev-режим).
func parseEnv(raw string) string {
	switch strings.ToLower(strings.TrimSpace(raw)) {
	case "", "development", "dev", "local":
		return EnvDevelopment
	default:
		return EnvProduction
	}
}

func loadSMTP() SMTPConfig {
	host := os.Getenv("SMTP_HOST")
	user := os.Getenv("SMTP_USER")
	logOnly := os.Getenv("SMTP_LOG_ONLY") == "1" || os.Getenv("SMTP_LOG_ONLY") == "true" || host == ""
	return SMTPConfig{
		Host:     host,
		Port:     envOr("SMTP_PORT", "587"),
		User:     user,
		Password: os.Getenv("SMTP_PASSWORD"),
		From:     envOr("SMTP_FROM", user),
		Enabled:  host != "" && !logOnly,
		LogOnly:  logOnly,
	}
}

func envOr(key, fallback string) string {
	if v := strings.TrimSpace(os.Getenv(key)); v != "" {
		return v
	}
	return fallback
}

// splitList разбирает список через запятую без пустых элементов.
func splitList(raw string) []string {
	var out []string
	for _, item := range strings.Split(raw, ",") {
		if item = strings.TrimSpace(item); item != "" {
			out = append(out, item)
		}
	}
	return out
}

func distinctRunes(s string) int {
	seen := make(map[rune]struct{}, len(s))
	for _, r := range s {
		seen[r] = struct{}{}
	}
	return len(seen)
}

func randomSecret() (string, error) {
	buf := make([]byte, 48)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(buf), nil
}
