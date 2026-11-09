// Package server собирает HTTP API: middleware безопасности, лимиты и маршруты.
package server

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"time"

	"github.com/execada/VRHomeConstruction/backend/internal/auth"
	"github.com/execada/VRHomeConstruction/backend/internal/config"
	"github.com/execada/VRHomeConstruction/backend/internal/handlers"
	"github.com/execada/VRHomeConstruction/backend/internal/middleware"
	"github.com/gin-gonic/gin"
)

const (
	// requestTimeout — крайний срок запроса (обращения к MongoDB прерываются, а не висят).
	requestTimeout = 15 * time.Second
	healthTimeout  = 2 * time.Second
	// Лимиты на IP: вход (перебор паролей) и коды подтверждения — регистрация, смена почты,
	// сброс пароля (перебор кодов, спам письмами); у всех маршрутов с кодами лимит общий.
	loginPerMinute = 20
	codesPerMinute = 10
	// Лимит изменяющих запросов на пользователя (автосохранение — не чаще раза в 1,5 с).
	writesPerMinute = 120
)

// Deps — обработчики и проверки, из которых собирается API.
type Deps struct {
	Tokens *auth.TokenService
	// Sessions отклоняет токены, выданные до сброса пароля (версия сессий в JWT устарела).
	Sessions middleware.SessionChecker
	Auth     *handlers.AuthHandler
	Projects *handlers.ProjectHandler
	Folders  *handlers.FolderHandler
	Layouts  *handlers.LayoutHandler
	// Health проверяет зависимости (MongoDB); nil — сервис считается здоровым.
	Health func(ctx context.Context) error
}

// NewRouter собирает gin.Engine. X-Forwarded-For учитывается только от доверенных
// прокси (cfg.TrustedProxies) — иначе клиентом считается адрес соединения и подделать
// IP, чтобы обойти лимиты, нельзя.
func NewRouter(cfg *config.Config, d Deps) (*gin.Engine, error) {
	r := gin.New()
	if err := r.SetTrustedProxies(cfg.TrustedProxies); err != nil {
		return nil, fmt.Errorf("trusted proxies: %w", err)
	}
	if d.Sessions == nil {
		return nil, errors.New("session checker is required: revoked tokens would be accepted")
	}
	r.Use(
		gin.Logger(),
		gin.Recovery(),
		middleware.SecurityHeaders(),
		middleware.CORS(cfg.AllowedOrigins),
		middleware.BodyLimit(middleware.MaxRequestBodyBytes),
		middleware.RequestTimeout(requestTimeout),
	)
	r.NoRoute(func(c *gin.Context) { c.JSON(http.StatusNotFound, gin.H{"error": "not found"}) })

	api := r.Group("/api")
	api.GET("/health", healthHandler(d.Health))
	registerAuthRoutes(api.Group("/auth"), d)

	protected := api.Group("",
		middleware.Auth(d.Tokens, d.Sessions),
		middleware.WritesOnly(middleware.RateLimitBy(writesPerMinute, time.Minute, middleware.ByUserID)),
	)
	registerProjectRoutes(protected.Group("/projects"), d.Projects)
	registerFolderRoutes(protected.Group("/folders"), d.Folders)
	registerLayoutRoutes(protected.Group("/layouts"), d.Layouts)
	return r, nil
}

func registerAuthRoutes(g *gin.RouterGroup, d Deps) {
	loginLimit := middleware.RateLimit(loginPerMinute, time.Minute)
	codeLimit := middleware.RateLimit(codesPerMinute, time.Minute)

	g.POST("/login", loginLimit, d.Auth.Login)
	g.POST("/send-code", codeLimit, d.Auth.SendCode)
	g.POST("/verify-code", codeLimit, d.Auth.VerifyCode)
	// Восстановление пароля: код на почту, затем код и новый пароль (прежние сессии отзываются).
	g.POST("/password/send-code", codeLimit, d.Auth.SendPasswordResetCode)
	g.POST("/password/reset", codeLimit, d.Auth.ResetPassword)

	me := g.Group("", middleware.Auth(d.Tokens, d.Sessions))
	me.GET("/me", d.Auth.Me)
	me.PATCH("/me", d.Auth.UpdateMe)
	// Смена почты: код уходит на новый адрес; нужен текущий пароль.
	me.POST("/email/send-code", codeLimit, d.Auth.SendEmailChangeCode)
	me.POST("/email/verify", codeLimit, d.Auth.VerifyEmailChange)
}

func registerProjectRoutes(g *gin.RouterGroup, h *handlers.ProjectHandler) {
	g.GET("", h.List)
	g.GET("/:id", h.GetByID)
	g.POST("", h.Create)
	g.PUT("/:id", h.Update)
	g.PATCH("/:id", h.Patch)
	g.POST("/:id/duplicate", h.Duplicate)
	g.DELETE("/:id", h.Delete)
}

func registerFolderRoutes(g *gin.RouterGroup, h *handlers.FolderHandler) {
	g.GET("", h.GetTree)
	g.POST("", h.Create)
	g.PUT("/:id", h.Update)
	g.DELETE("/:id", h.Delete)
}

func registerLayoutRoutes(g *gin.RouterGroup, h *handlers.LayoutHandler) {
	g.GET("", h.List)
	g.GET("/:id", h.GetByID)
	g.POST("", h.Create)
	g.PUT("/:id", h.Update)
	g.DELETE("/:id", h.Delete)
}

// healthHandler — проверка готовности: 200, если зависимости отвечают, иначе 503.
func healthHandler(check func(ctx context.Context) error) gin.HandlerFunc {
	return func(c *gin.Context) {
		if check != nil {
			ctx, cancel := context.WithTimeout(c.Request.Context(), healthTimeout)
			defer cancel()
			if err := check(ctx); err != nil {
				c.JSON(http.StatusServiceUnavailable, gin.H{"status": "unavailable"})
				return
			}
		}
		c.JSON(http.StatusOK, gin.H{"status": "ok"})
	}
}
