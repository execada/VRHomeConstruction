package middleware

import (
	"context"
	"log"
	"net/http"
	"strings"

	"github.com/execada/VRHomeConstruction/backend/internal/auth"
	"github.com/gin-gonic/gin"
)

const ContextUserIDKey = "userId"

// SessionChecker сверяет версию сессии из токена с текущей версией пользователя: она растёт
// при сбросе пароля, и токены, выданные раньше, перестают действовать. Удалённый
// пользователь — тоже недействующая сессия.
type SessionChecker interface {
	SessionActive(ctx context.Context, userID string, version int64) (bool, error)
}

// Auth пропускает запрос с действующим JWT (подпись, срок, версия сессии) и кладёт
// userId в контекст. Версия сверяется на каждом запросе (один запрос к MongoDB по _id,
// только поле tokenVersion) — без кеша, чтобы отзыв сессий действовал сразу.
func Auth(tokens *auth.TokenService, sessions SessionChecker) gin.HandlerFunc {
	return func(c *gin.Context) {
		header := c.GetHeader("Authorization")
		if header == "" {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "authorization required"})
			return
		}

		parts := strings.SplitN(header, " ", 2)
		if len(parts) != 2 || !strings.EqualFold(parts[0], "Bearer") {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "invalid authorization header"})
			return
		}

		claims, err := tokens.Parse(parts[1])
		if err != nil {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "invalid or expired token"})
			return
		}

		active, err := sessions.SessionActive(c.Request.Context(), claims.UserID, claims.Version)
		if err != nil {
			log.Printf("[ERROR] %s %s session check user=%q: %v", c.Request.Method, c.Request.URL.Path, claims.UserID, err)
			c.AbortWithStatusJSON(http.StatusInternalServerError, gin.H{"error": "internal server error"})
			return
		}
		if !active {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "invalid or expired token"})
			return
		}

		c.Set(ContextUserIDKey, claims.UserID)
		c.Next()
	}
}

func GetUserID(c *gin.Context) string {
	userID, _ := c.Get(ContextUserIDKey)
	id, _ := userID.(string)
	return id
}
