package services

import (
	"errors"
	"fmt"
	"math"
	"net/mail"
	"regexp"
	"slices"
	"strings"
	"unicode"
	"unicode/utf8"
)

// Ограничения метаданных проектов, шаблонов и профиля.
const (
	maxProjectNameLen = 120
	maxUserNameLen    = 60
	maxDescriptionLen = 500
	maxTags           = 10
	maxTagLen         = 32
	maxStatusLen      = 32
	maxThumbnailLen   = 300_000
	maxEmailLen       = 254
	maxTemplateLen    = 64
	maxFolderNameLen  = 80
	// Элементов в списках папки (проекты, шаблоны, вложенные папки).
	maxFolderItems = 500
	// Проектов на пользователя: защита хранилища от бесконечного создания/дублирования.
	maxProjectsPerUser = 500
	// Координаты позы камеры, м/рад: с запасом больше любой комнаты.
	maxPoseAbs     = 10_000
	copyNameSuffix = " (копия)"
)

// Статусы проекта, которые понимает клиент.
var allowedStatuses = []string{"draft", "active", "archived"}

// Идентификаторы документов: ObjectID-hex и старые строковые id — без спецсимволов.
var idPattern = regexp.MustCompile(`^[A-Za-z0-9_-]{1,64}$`)

// Виды ошибок валидации: errors.Is(err, ErrInvalidX) работает для любой ValidationError.
var (
	ErrInvalidRoomData    = errors.New("invalid roomData")
	ErrInvalidName        = errors.New("invalid name")
	ErrInvalidDescription = errors.New("invalid description")
	ErrInvalidTags        = errors.New("invalid tags")
	ErrInvalidThumbnail   = errors.New("invalid thumbnail")
	ErrInvalidStatus      = errors.New("invalid status")
	ErrInvalidEmail       = errors.New("invalid email")
	ErrInvalidTemplate    = errors.New("invalid template")
	ErrInvalidPose        = errors.New("invalid camera pose")
	ErrInvalidFolder      = errors.New("invalid folder")
	ErrProjectLimit       = errors.New("project limit reached")
)

var thumbnailPrefix = regexp.MustCompile(`^data:image/(jpeg|png|webp);base64,`)

// ValidationError — ошибка входных данных. Текст безопасно отдавать клиенту (HTTP 400).
type ValidationError struct {
	kind   error
	reason string
}

func (e *ValidationError) Error() string { return e.reason }
func (e *ValidationError) Unwrap() error { return e.kind }

func newValidationError(kind error, format string, args ...interface{}) *ValidationError {
	return &ValidationError{kind: kind, reason: fmt.Sprintf(format, args...)}
}

// IsValidationError сообщает, что err вызван некорректными входными данными.
func IsValidationError(err error) bool {
	var ve *ValidationError
	return errors.As(err, &ve)
}

// normalizeName обрезает пробелы и проверяет длину имени (1..maxLen символов).
func normalizeName(raw string, maxLen int) (string, error) {
	name := strings.TrimSpace(raw)
	if n := utf8.RuneCountInString(name); n < 1 || n > maxLen {
		return "", newValidationError(ErrInvalidName, "name must be between 1 and %d characters", maxLen)
	}
	return name, nil
}

func normalizeDescription(raw string) (string, error) {
	description := strings.TrimSpace(raw)
	if utf8.RuneCountInString(description) > maxDescriptionLen {
		return "", newValidationError(ErrInvalidDescription, "description must be at most %d characters", maxDescriptionLen)
	}
	return description, nil
}

func normalizeStatus(raw string) (string, error) {
	status := strings.TrimSpace(raw)
	if n := utf8.RuneCountInString(status); n < 1 || n > maxStatusLen {
		return "", newValidationError(ErrInvalidStatus, "status must be between 1 and %d characters", maxStatusLen)
	}
	if !slices.Contains(allowedStatuses, status) {
		return "", newValidationError(ErrInvalidStatus, "status must be one of %s", strings.Join(allowedStatuses, ", "))
	}
	return status, nil
}

// normalizeTemplate: nil — не менять; пустая строка — убрать; иначе id шаблона до maxTemplateLen.
func normalizeTemplate(raw *string) (*string, error) {
	if raw == nil {
		return nil, nil
	}
	template := strings.TrimSpace(*raw)
	if utf8.RuneCountInString(template) > maxTemplateLen {
		return nil, newValidationError(ErrInvalidTemplate, "template must be at most %d characters", maxTemplateLen)
	}
	return &template, nil
}

// validatePose — поза камеры: ровно три конечных числа в разумных пределах (копия среза).
func validatePose(v []float64) ([]float64, error) {
	if len(v) != 3 {
		return nil, newValidationError(ErrInvalidPose, "camera pose must contain exactly 3 numbers")
	}
	for _, x := range v {
		if math.IsNaN(x) || math.IsInf(x, 0) || math.Abs(x) > maxPoseAbs {
			return nil, newValidationError(ErrInvalidPose, "camera pose values must be finite and within ±%d", maxPoseAbs)
		}
	}
	return slices.Clone(v), nil
}

// normalizeIDList проверяет список идентификаторов: формат, без повторов, не длиннее max.
// Всегда возвращает новый срез, nil превращается в [].
func normalizeIDList(ids []string, max int, field string) ([]string, error) {
	out := make([]string, 0, min(len(ids), max))
	seen := make(map[string]struct{}, len(ids))
	for _, raw := range ids {
		id := strings.TrimSpace(raw)
		if !idPattern.MatchString(id) {
			return nil, newValidationError(ErrInvalidFolder, "%s contains an invalid id", field)
		}
		if _, dup := seen[id]; dup {
			continue
		}
		if len(out) == max {
			return nil, newValidationError(ErrInvalidFolder, "%s must contain at most %d items", field, max)
		}
		seen[id] = struct{}{}
		out = append(out, id)
	}
	return out, nil
}

// normalizeTags обрезает пробелы, убирает дубли (без учёта регистра, остаётся первый)
// и проверяет лимиты. Всегда возвращает новый срез, nil превращается в [].
func normalizeTags(raw []string) ([]string, error) {
	tags := make([]string, 0, min(len(raw), maxTags))
	seen := make(map[string]struct{}, maxTags)
	for _, t := range raw {
		tag := strings.TrimSpace(t)
		if n := utf8.RuneCountInString(tag); n < 1 || n > maxTagLen {
			return nil, newValidationError(ErrInvalidTags, "each tag must be between 1 and %d characters", maxTagLen)
		}
		key := strings.ToLower(tag)
		if _, dup := seen[key]; dup {
			continue
		}
		if len(tags) == maxTags {
			return nil, newValidationError(ErrInvalidTags, "tags must contain at most %d items", maxTags)
		}
		seen[key] = struct{}{}
		tags = append(tags, tag)
	}
	return tags, nil
}

// validateThumbnail допускает "" (нет превью) или base64 data URL картинки JPEG/PNG/WebP.
// Набор символов base64 проверяется явно: строка не сможет «выйти» из src/url(...).
func validateThumbnail(raw string) (string, error) {
	if raw == "" {
		return "", nil
	}
	if len(raw) > maxThumbnailLen {
		return "", newValidationError(ErrInvalidThumbnail, "thumbnail must be at most %d characters", maxThumbnailLen)
	}
	loc := thumbnailPrefix.FindStringIndex(raw)
	if loc == nil {
		return "", newValidationError(ErrInvalidThumbnail,
			"thumbnail must be a data URL starting with data:image/jpeg|png|webp;base64,")
	}
	if !isBase64Payload(raw[loc[1]:]) {
		return "", newValidationError(ErrInvalidThumbnail, "thumbnail must contain non-empty base64 image data")
	}
	return raw, nil
}

func isBase64Payload(s string) bool {
	if s == "" {
		return false
	}
	for i := 0; i < len(s); i++ {
		c := s[i]
		isAlnum := (c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9')
		if !isAlnum && c != '+' && c != '/' && c != '=' {
			return false
		}
	}
	return true
}

// validateEmailFormat ожидает уже нормализованный адрес (см. normalizeEmail):
// один addr-spec без отображаемого имени и домен с точкой.
func validateEmailFormat(email string) error {
	if !isValidEmail(email) {
		return newValidationError(ErrInvalidEmail, "invalid email format")
	}
	return nil
}

func isValidEmail(email string) bool {
	if email == "" || len(email) > maxEmailLen {
		return false
	}
	addr, err := mail.ParseAddress(email)
	if err != nil || addr.Name != "" || addr.Address != email {
		return false
	}
	domain := email[strings.LastIndex(email, "@")+1:]
	return strings.Contains(domain, ".") && !strings.HasPrefix(domain, ".") && !strings.HasSuffix(domain, ".")
}

// duplicateName — имя копии проекта: суффикс сохраняется, обрезается исходное имя.
func duplicateName(name string) string {
	base := truncateRunes(strings.TrimSpace(name), maxProjectNameLen-utf8.RuneCountInString(copyNameSuffix))
	return strings.TrimSpace(strings.TrimRightFunc(base, unicode.IsSpace) + copyNameSuffix)
}

func truncateRunes(s string, maxRunes int) string {
	if utf8.RuneCountInString(s) <= maxRunes {
		return s
	}
	return string([]rune(s)[:maxRunes])
}
