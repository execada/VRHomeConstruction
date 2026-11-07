package handlers

import (
	"errors"
	"net/http"

	"github.com/execada/VRHomeConstruction/backend/internal/middleware"
	"github.com/execada/VRHomeConstruction/backend/internal/models"
	"github.com/execada/VRHomeConstruction/backend/internal/services"
	"github.com/gin-gonic/gin"
)

type AuthHandler struct {
	service *services.AuthService
}

func NewAuthHandler(service *services.AuthService) *AuthHandler {
	return &AuthHandler{service: service}
}

func (h *AuthHandler) SendCode(c *gin.Context) {
	var req models.SendCodeRequest
	if !bindJSON(c, &req) {
		return
	}

	resp, err := h.service.SendCode(c.Request.Context(), req)
	if err != nil {
		h.handleAuthError(c, err)
		return
	}
	c.JSON(http.StatusOK, resp)
}

func (h *AuthHandler) VerifyCode(c *gin.Context) {
	var req models.VerifyCodeRequest
	if !bindJSON(c, &req) {
		return
	}

	resp, err := h.service.VerifyCode(c.Request.Context(), req)
	if err != nil {
		h.handleAuthError(c, err)
		return
	}
	c.JSON(http.StatusOK, resp)
}

// Login — вход по email и паролю (без кода подтверждения).
func (h *AuthHandler) Login(c *gin.Context) {
	var req models.LoginRequest
	if !bindJSON(c, &req) {
		return
	}

	resp, err := h.service.Login(c.Request.Context(), req)
	if err != nil {
		h.handleAuthError(c, err)
		return
	}
	c.JSON(http.StatusOK, resp)
}

func (h *AuthHandler) Me(c *gin.Context) {
	userID := middleware.GetUserID(c)
	if userID == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	user, err := h.service.GetByID(c.Request.Context(), userID)
	if err != nil {
		h.handleAuthError(c, err)
		return
	}
	c.JSON(http.StatusOK, user)
}

// UpdateMe — PATCH /api/auth/me: смена имени, ответ — обновлённый UserPublic.
func (h *AuthHandler) UpdateMe(c *gin.Context) {
	var req models.UpdateProfileRequest
	if !bindJSON(c, &req) {
		return
	}

	user, err := h.service.UpdateProfile(c.Request.Context(), middleware.GetUserID(c), req)
	if err != nil {
		h.handleAuthError(c, err)
		return
	}
	c.JSON(http.StatusOK, user)
}

// SendEmailChangeCode — POST /api/auth/email/send-code: код на новый адрес.
func (h *AuthHandler) SendEmailChangeCode(c *gin.Context) {
	var req models.EmailChangeCodeRequest
	if !bindJSON(c, &req) {
		return
	}

	resp, err := h.service.SendEmailChangeCode(c.Request.Context(), middleware.GetUserID(c), req)
	if err != nil {
		h.handleAuthError(c, err)
		return
	}
	c.JSON(http.StatusOK, resp)
}

// VerifyEmailChange — POST /api/auth/email/verify: подтверждение кода и смена email.
func (h *AuthHandler) VerifyEmailChange(c *gin.Context) {
	var req models.EmailChangeVerifyRequest
	if !bindJSON(c, &req) {
		return
	}

	resp, err := h.service.VerifyEmailChange(c.Request.Context(), middleware.GetUserID(c), req)
	if err != nil {
		h.handleAuthError(c, err)
		return
	}
	c.JSON(http.StatusOK, resp)
}

// SendPasswordResetCode — POST /api/auth/password/send-code: код для сброса пароля на почту.
// Ответ одинаковый, есть ли аккаунт с этой почтой или нет.
func (h *AuthHandler) SendPasswordResetCode(c *gin.Context) {
	var req models.PasswordResetCodeRequest
	if !bindJSON(c, &req) {
		return
	}

	resp, err := h.service.SendPasswordResetCode(c.Request.Context(), req)
	if err != nil {
		h.handleAuthError(c, err)
		return
	}
	c.JSON(http.StatusOK, resp)
}

// ResetPassword — POST /api/auth/password/reset: код из письма и новый пароль; прежние
// сессии перестают действовать.
func (h *AuthHandler) ResetPassword(c *gin.Context) {
	var req models.PasswordResetRequest
	if !bindJSON(c, &req) {
		return
	}

	resp, err := h.service.ResetPassword(c.Request.Context(), req)
	if err != nil {
		h.handleAuthError(c, err)
		return
	}
	c.JSON(http.StatusOK, resp)
}

func (h *AuthHandler) handleAuthError(c *gin.Context, err error) {
	switch {
	case errors.Is(err, services.ErrUserAlreadyExists):
		c.JSON(http.StatusConflict, gin.H{"error": "email already registered"})
	case errors.Is(err, services.ErrUserNotFound):
		c.JSON(http.StatusUnauthorized, gin.H{"error": "user not found"})
	case errors.Is(err, services.ErrInvalidCredentials):
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid email or password"})
	case errors.Is(err, services.ErrWrongPassword):
		// 403, а не 401: сессия действительна, неверен только подтверждающий пароль.
		c.JSON(http.StatusForbidden, gin.H{"error": "invalid password"})
	case errors.Is(err, services.ErrInvalidCode):
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid verification code"})
	case errors.Is(err, services.ErrCodeExpired):
		c.JSON(http.StatusUnauthorized, gin.H{"error": "verification code expired, request a new one"})
	case errors.Is(err, services.ErrCodeResendTooSoon):
		c.JSON(http.StatusTooManyRequests, gin.H{"error": "code was sent recently, wait 30 seconds before retrying"})
	case errors.Is(err, services.ErrTooManyAttempts):
		c.JSON(http.StatusTooManyRequests, gin.H{"error": "too many invalid attempts, request a new code"})
	case errors.Is(err, services.ErrTooManyLoginAttempts):
		c.JSON(http.StatusTooManyRequests, gin.H{"error": "too many login attempts, try again later"})
	case errors.Is(err, services.ErrTooManyResetAttempts):
		c.JSON(http.StatusTooManyRequests, gin.H{"error": "too many password reset attempts, try again later"})
	case errors.Is(err, services.ErrNameRequired), errors.Is(err, services.ErrPasswordTooShort),
		errors.Is(err, services.ErrPasswordTooLong), errors.Is(err, services.ErrInvalidPurpose),
		services.IsValidationError(err):
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
	default:
		// Не отдаём наружу текст внутренних ошибок (детали БД и т.п.).
		respondInternalError(c, err)
	}
}
