package handlers

import (
	"errors"
	"io"
	"log"
	"net/http"
	"strconv"
	"unicode"
	"unicode/utf8"

	"github.com/execada/VRHomeConstruction/backend/internal/middleware"
	"github.com/execada/VRHomeConstruction/backend/internal/services"
	"github.com/gin-gonic/gin"
	"github.com/go-playground/validator/v10"
)

// bindJSON разбирает JSON-тело в dst. При ошибке сам отвечает клиенту
// (413 — тело больше лимита BodyLimit, 400 — пустое/некорректное тело) и возвращает false.
// Текст 400 не содержит имён Go-структур и типов — только имя поля из JSON.
func bindJSON(c *gin.Context, dst interface{}) bool {
	err := c.ShouldBindJSON(dst)
	switch {
	case err == nil:
		return true
	case middleware.IsBodyTooLarge(err):
		middleware.RespondBodyTooLarge(c)
	case errors.Is(err, io.EOF):
		c.JSON(http.StatusBadRequest, gin.H{"error": "request body is required"})
	default:
		c.JSON(http.StatusBadRequest, gin.H{"error": bindErrorMessage(err)})
	}
	return false
}

// bindErrorMessage — причина ошибки разбора тела: «invalid field: <имя>» для
// нарушенных правил binding, иначе (синтаксис, типы) — общий текст.
func bindErrorMessage(err error) string {
	var invalid validator.ValidationErrors
	if errors.As(err, &invalid) && len(invalid) > 0 {
		return "invalid field: " + jsonFieldName(invalid[0].Field())
	}
	return "invalid JSON body"
}

// jsonFieldName переводит имя поля Go в имя из JSON-тела (Email → email, NewEmail → newEmail).
func jsonFieldName(field string) string {
	r, size := utf8.DecodeRuneInString(field)
	if size == 0 {
		return "body"
	}
	return string(unicode.ToLower(r)) + field[size:]
}

// respondInternalError пишет детали в лог с контекстом запроса и отдаёт клиенту
// обезличенный 500: тексты ошибок БД и прочие внутренности наружу не попадают.
func respondInternalError(c *gin.Context, err error) {
	log.Printf("[ERROR] %s %s user=%q: %v", c.Request.Method, c.Request.URL.Path, middleware.GetUserID(c), err)
	c.JSON(http.StatusInternalServerError, gin.H{"error": "internal server error"})
}

// respondServiceError переводит ошибку сервиса в ответ: «не найден/чужой» → 404
// (существование чужих ресурсов не раскрывается), ошибка валидации → 400 с причиной,
// остальное → 500.
func respondServiceError(c *gin.Context, err error, notFoundMsg string, notFound ...error) {
	for _, target := range notFound {
		if errors.Is(err, target) {
			c.JSON(http.StatusNotFound, gin.H{"error": notFoundMsg})
			return
		}
	}
	if services.IsValidationError(err) {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	respondInternalError(c, err)
}

// parsePagination читает page/limit из query: отсутствующие или нечисловые значения
// заменяются значениями по умолчанию, числа ограничиваются services.NormalizePagination.
func parsePagination(c *gin.Context) (int64, int64) {
	page, err := strconv.ParseInt(c.Query("page"), 10, 64)
	if err != nil {
		page = 1
	}
	limit, err := strconv.ParseInt(c.Query("limit"), 10, 64)
	if err != nil {
		limit = services.DefaultPageLimit
	}
	return services.NormalizePagination(page, limit)
}
