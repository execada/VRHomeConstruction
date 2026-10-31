package middleware

import (
	"net/http"
	"strings"

	"github.com/execada/VRHomeConstruction/backend/internal/auth"
	"github.com/gin-gonic/gin"
)

const ContextUserIDKey = "userId"

func Auth(tokens *auth.TokenService) gin.HandlerFunc {
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

		c.Set(ContextUserIDKey, claims.UserID)
		c.Next()
	}
}

func GetUserID(c *gin.Context) string {
	userID, _ := c.Get(ContextUserIDKey)
	id, _ := userID.(string)
	return id
}
