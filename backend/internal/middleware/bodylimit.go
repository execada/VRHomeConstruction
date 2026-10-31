package middleware

import (
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"
)

// MaxRequestBodyBytes — общий лимит тела запроса: сцена (≤ 2 МБ) + превью (≤ 300 КБ) с запасом.
const MaxRequestBodyBytes int64 = 4 << 20

// BodyLimit ограничивает размер тела запроса. Заявленный Content-Length сверх лимита
// отклоняется сразу; тело без длины (chunked) обрезает http.MaxBytesReader, а ошибку
// чтения обработчик превращает в 413 (см. IsBodyTooLarge).
func BodyLimit(maxBytes int64) gin.HandlerFunc {
	return func(c *gin.Context) {
		if c.Request.ContentLength > maxBytes {
			RespondBodyTooLarge(c)
			return
		}
		if c.Request.Body != nil {
			c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, maxBytes)
		}
		c.Next()
	}
}

// IsBodyTooLarge сообщает, что чтение тела упёрлось в лимит BodyLimit.
func IsBodyTooLarge(err error) bool {
	var tooLarge *http.MaxBytesError
	return errors.As(err, &tooLarge)
}

// RespondBodyTooLarge отвечает 413 в общем формате ошибок API.
func RespondBodyTooLarge(c *gin.Context) {
	c.AbortWithStatusJSON(http.StatusRequestEntityTooLarge, gin.H{"error": "request body too large"})
}
