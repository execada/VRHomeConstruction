package config

import (
	"strings"
	"testing"
)

const strongSecret = "Zq8+v3Nf1Lk9Xw2Tb7Rm4Hs6Jd0Pc5Ye_ag"

func clearEnv(t *testing.T) {
	t.Helper()
	for _, k := range []string{
		"APP_ENV", "PORT", "MONGO_URI", "JWT_SECRET", "ALLOWED_ORIGINS", "TRUSTED_PROXIES",
		"SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASSWORD", "SMTP_FROM",
		"SMTP_LOG_ONLY", "RESEND_API_KEY", "RESEND_FROM", "ALLOW_LOG_ONLY_MAIL",
		"BREVO_API_KEY", "BREVO_FROM",
	} {
		t.Setenv(k, "")
	}
}

func TestLoadDefaults(t *testing.T) {
	clearEnv(t)
	cfg := Load()

	if cfg.Env != EnvDevelopment || cfg.Port != "8080" || cfg.MongoURI != "mongodb://localhost:27017" {
		t.Fatalf("unexpected defaults: env=%q port=%q mongo=%q", cfg.Env, cfg.Port, cfg.MongoURI)
	}
	// Без JWT_SECRET в dev генерируется случайный секрет, а не общеизвестная строка.
	if !cfg.JWTSecretGenerated || cfg.JWTSecret == legacyDevJWTSecret || len(cfg.JWTSecret) < minJWTSecretBytes {
		t.Fatalf("expected a generated random secret, got generated=%v len=%d", cfg.JWTSecretGenerated, len(cfg.JWTSecret))
	}
	if second := Load(); second.JWTSecret == cfg.JWTSecret {
		t.Fatal("generated secrets must differ between processes")
	}
	if !cfg.SMTP.LogOnly || cfg.SMTP.Enabled || cfg.SMTP.Port != "587" {
		t.Fatalf("unexpected smtp defaults: %+v", cfg.SMTP)
	}
	if len(cfg.AllowedOrigins) != 1 || cfg.AllowedOrigins[0] != "*" {
		t.Fatalf("dev CORS should allow all, got %v", cfg.AllowedOrigins)
	}
	if err := cfg.Validate(); err != nil {
		t.Fatalf("dev defaults must be valid: %v", err)
	}
}

func TestLegacyDevSecretIsReplacedInDevelopment(t *testing.T) {
	clearEnv(t)
	t.Setenv("JWT_SECRET", legacyDevJWTSecret)
	cfg := Load()
	if cfg.JWTSecret == legacyDevJWTSecret || !cfg.JWTSecretGenerated {
		t.Fatal("the public legacy secret must never be used")
	}
}

func TestLoadOverrides(t *testing.T) {
	clearEnv(t)
	t.Setenv("PORT", "9000")
	t.Setenv("MONGO_URI", "mongodb://db:27017")
	t.Setenv("JWT_SECRET", strongSecret)
	t.Setenv("SMTP_HOST", "smtp.example.com")
	t.Setenv("SMTP_USER", "noreply@example.com")
	t.Setenv("SMTP_PASSWORD", "pw")
	t.Setenv("TRUSTED_PROXIES", " 172.28.0.0/16 , 10.0.0.1 ,")
	t.Setenv("ALLOWED_ORIGINS", "https://a.example, https://b.example")

	cfg := Load()

	if cfg.Port != "9000" || cfg.MongoURI != "mongodb://db:27017" || cfg.JWTSecret != strongSecret || cfg.JWTSecretGenerated {
		t.Fatalf("overrides not applied: %+v", cfg)
	}
	if !cfg.SMTP.Enabled || cfg.SMTP.LogOnly || cfg.SMTP.From != "noreply@example.com" {
		t.Fatalf("unexpected smtp config: %+v", cfg.SMTP)
	}
	if strings.Join(cfg.TrustedProxies, "|") != "172.28.0.0/16|10.0.0.1" {
		t.Fatalf("unexpected trusted proxies: %v", cfg.TrustedProxies)
	}
	if len(cfg.AllowedOrigins) != 2 {
		t.Fatalf("unexpected origins: %v", cfg.AllowedOrigins)
	}
}

func TestLoadSMTPLogOnlyOverride(t *testing.T) {
	clearEnv(t)
	t.Setenv("SMTP_HOST", "smtp.example.com")
	t.Setenv("SMTP_LOG_ONLY", "true")
	cfg := Load()
	if !cfg.SMTP.LogOnly || cfg.SMTP.Enabled {
		t.Fatalf("expected log-only smtp, got %+v", cfg.SMTP)
	}
}

func TestParseEnvFailsClosed(t *testing.T) {
	for raw, want := range map[string]string{
		"": EnvDevelopment, "dev": EnvDevelopment, "Development": EnvDevelopment, " local ": EnvDevelopment,
		"production": EnvProduction, "Production": EnvProduction, "prod": EnvProduction, "staging": EnvProduction,
	} {
		if got := parseEnv(raw); got != want {
			t.Errorf("parseEnv(%q) = %q, want %q", raw, got, want)
		}
	}
}

func TestValidateProduction(t *testing.T) {
	base := func() *Config {
		return &Config{Env: EnvProduction, JWTSecret: strongSecret, ResendAPIKey: "re_test"}
	}
	if err := base().Validate(); err != nil {
		t.Fatalf("valid production config rejected: %v", err)
	}

	cases := map[string]func(c *Config){
		"нет секрета":      func(c *Config) { c.JWTSecret = "" },
		"публичный секрет": func(c *Config) { c.JWTSecret = legacyDevJWTSecret },
		"короткий секрет":  func(c *Config) { c.JWTSecret = "short-secret" },
		"заглушка":         func(c *Config) { c.JWTSecret = strings.Repeat("ab", 40) },
		"нет почты":        func(c *Config) { c.ResendAPIKey = "" },
		"CORS для всех":    func(c *Config) { c.AllowedOrigins = []string{"*"} },
	}
	for name, mutate := range cases {
		cfg := base()
		mutate(cfg)
		if err := cfg.Validate(); err == nil {
			t.Errorf("%s: expected validation error", name)
		}
	}
}

func TestProductionWithoutOriginsDisablesCORS(t *testing.T) {
	clearEnv(t)
	t.Setenv("APP_ENV", "production")
	t.Setenv("JWT_SECRET", strongSecret)
	cfg := Load()
	if len(cfg.AllowedOrigins) != 0 {
		t.Fatalf("production without ALLOWED_ORIGINS must not allow any cross-origin, got %v", cfg.AllowedOrigins)
	}
	if cfg.JWTSecretGenerated {
		t.Fatal("production must never generate a secret")
	}
}

// ALLOW_LOG_ONLY_MAIL — явное решение оператора, когда хостинг закрыл исходящий SMTP:
// production стартует с кодами в логах. Без флага сервер по-прежнему не запускается.
func TestProductionLogOnlyMailNeedsExplicitOptIn(t *testing.T) {
	clearEnv(t)
	t.Setenv("APP_ENV", "production")
	t.Setenv("JWT_SECRET", strongSecret)
	if err := Load().Validate(); err == nil {
		t.Fatal("production without mail must not start by default")
	}

	for _, value := range []string{"true", "1", " TRUE "} {
		t.Setenv("ALLOW_LOG_ONLY_MAIL", value)
		cfg := Load()
		if !cfg.AllowLogOnlyMail {
			t.Fatalf("%q must enable the opt-in", value)
		}
		if err := cfg.Validate(); err != nil {
			t.Fatalf("explicit opt-in must allow log-only mail, got %v", err)
		}
	}

	t.Setenv("ALLOW_LOG_ONLY_MAIL", "yes please")
	if Load().AllowLogOnlyMail {
		t.Fatal("only true/1 enable the opt-in")
	}
}

func TestBrevoMailConfig(t *testing.T) {
	clearEnv(t)
	t.Setenv("APP_ENV", "production")
	t.Setenv("JWT_SECRET", strongSecret)
	t.Setenv("BREVO_API_KEY", "xkeysib-test")

	if err := Load().Validate(); err == nil || !strings.Contains(err.Error(), "BREVO_FROM") {
		t.Fatalf("a Brevo key without a sender must be rejected, got %v", err)
	}
	t.Setenv("BREVO_FROM", " VR Home <noreply@example.com> ")
	cfg := Load()
	if !cfg.MailConfigured() || cfg.BrevoFrom != "VR Home <noreply@example.com>" {
		t.Fatalf("Brevo must count as configured mail, got %+v", cfg)
	}
	if err := cfg.Validate(); err != nil {
		t.Fatalf("valid Brevo production config rejected: %v", err)
	}
}
