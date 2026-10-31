package middleware

import "github.com/gin-gonic/gin"

// SecurityHeaders добавляет защитные заголовки ко всем ответам API
// (выставляются до обработчика, поэтому есть и в ответах об ошибках).
func SecurityHeaders() gin.HandlerFunc {
	return func(c *gin.Context) {
		h := c.Writer.Header()
		h.Set("X-Content-Type-Options", "nosniff")
		h.Set("X-Frame-Options", "DENY")
		h.Set("Referrer-Policy", "strict-origin-when-cross-origin")
		// Ответы API (токены, профиль) не кэшируются и не встраиваются как документы.
		h.Set("Cache-Control", "no-store")
		h.Set("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'")
		c.Next()
	}
}
