package main

import (
	"context"
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/execada/VRHomeConstruction/backend/internal/auth"
	"github.com/execada/VRHomeConstruction/backend/internal/config"
	"github.com/execada/VRHomeConstruction/backend/internal/database"
	"github.com/execada/VRHomeConstruction/backend/internal/email"
	"github.com/execada/VRHomeConstruction/backend/internal/handlers"
	"github.com/execada/VRHomeConstruction/backend/internal/repositories"
	"github.com/execada/VRHomeConstruction/backend/internal/server"
	"github.com/execada/VRHomeConstruction/backend/internal/services"
	"github.com/gin-gonic/gin"
	"go.mongodb.org/mongo-driver/mongo"
)

const (
	tokenTTL        = 7 * 24 * time.Hour
	shutdownTimeout = 10 * time.Second
)

func main() {
	if err := run(); err != nil {
		log.Fatal(err)
	}
}

// run поднимает сервер и блокируется до сигнала остановки (graceful shutdown).
func run() error {
	cfg := config.Load()
	if err := cfg.Validate(); err != nil {
		return err
	}
	if cfg.IsProduction() {
		gin.SetMode(gin.ReleaseMode)
	}
	if cfg.JWTSecretGenerated {
		log.Println("WARN: JWT_SECRET не задан — случайный секрет до перезапуска (после перезапуска нужно войти заново)")
	}
	logMailMode(cfg)

	client, err := database.Connect(cfg.MongoURI)
	if err != nil {
		return fmt.Errorf("connect to MongoDB: %w", err)
	}
	defer disconnect(client)
	log.Println("connected to MongoDB")

	db := client.Database(database.Name)
	if err := database.EnsureIndexes(context.Background(), db); err != nil {
		return fmt.Errorf("ensure MongoDB indexes: %w", err)
	}

	authService, deps := wire(cfg, client, db)
	router, err := server.NewRouter(cfg, deps)
	if err != nil {
		return err
	}
	return serve(cfg, router, authService)
}

// wire создаёт репозитории, сервисы и обработчики.
func wire(cfg *config.Config, client *mongo.Client, db *mongo.Database) (*services.AuthService, server.Deps) {
	tokens := auth.NewTokenService(cfg.JWTSecret, tokenTTL)
	authService := services.NewAuthService(
		repositories.NewUserRepo(db),
		repositories.NewVerificationRepo(db),
		tokens,
		email.NewSender(cfg),
	)
	folderRepo := repositories.NewFolderRepo(db)
	projectService := services.NewProjectService(repositories.NewProjectRepo(db)).WithFolderCleanup(folderRepo)

	return authService, server.Deps{
		Tokens:   tokens,
		Auth:     handlers.NewAuthHandler(authService),
		Projects: handlers.NewProjectHandler(projectService),
		Folders:  handlers.NewFolderHandler(services.NewFolderService(folderRepo)),
		Layouts:  handlers.NewLayoutHandler(services.NewLayoutService(repositories.NewLayoutRepo(db))),
		Health:   func(ctx context.Context) error { return client.Ping(ctx, nil) },
	}
}

// serve запускает HTTP-сервер и останавливает его по SIGINT/SIGTERM, дожидаясь
// активных запросов и писем с кодами.
func serve(cfg *config.Config, handler http.Handler, authService *services.AuthService) error {
	srv := &http.Server{
		Addr:              ":" + cfg.Port,
		Handler:           handler,
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       30 * time.Second,
		WriteTimeout:      30 * time.Second,
		IdleTimeout:       120 * time.Second,
	}

	serveErr := make(chan error, 1)
	go func() {
		log.Printf("starting server on port %s (env=%s)", cfg.Port, cfg.Env)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			serveErr <- err
		}
		close(serveErr)
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	select {
	case err := <-serveErr:
		return fmt.Errorf("http server: %w", err)
	case <-quit:
	}

	log.Println("shutting down server...")
	ctx, cancel := context.WithTimeout(context.Background(), shutdownTimeout)
	defer cancel()
	if err := srv.Shutdown(ctx); err != nil {
		log.Printf("forced shutdown: %v", err)
	}
	if err := authService.Shutdown(ctx); err != nil {
		log.Printf("pending emails not sent before shutdown: %v", err)
	}
	log.Println("server stopped")
	return nil
}

func disconnect(client *mongo.Client) {
	ctx, cancel := context.WithTimeout(context.Background(), shutdownTimeout)
	defer cancel()
	if err := client.Disconnect(ctx); err != nil {
		log.Printf("disconnect MongoDB: %v", err)
	}
}

func logMailMode(cfg *config.Config) {
	switch {
	case cfg.ResendAPIKey != "":
		log.Printf("Email: Resend API (from %s)", cfg.ResendFrom)
	case cfg.BrevoAPIKey != "":
		log.Printf("Email: Brevo API (from %s)", cfg.BrevoFrom)
	case cfg.SMTP.Enabled:
		log.Printf("Email: SMTP %s:%s", cfg.SMTP.Host, cfg.SMTP.Port)
	case cfg.IsProduction():
		log.Println("WARN: почта не настроена (ALLOW_LOG_ONLY_MAIL=true) — коды подтверждения печатаются в лог ([CODE]); подключите BREVO_API_KEY, RESEND_API_KEY или SMTP")
	default:
		log.Println("Email: только логи (dev) — код подтверждения печатается в консоль ([CODE])")
	}
}
