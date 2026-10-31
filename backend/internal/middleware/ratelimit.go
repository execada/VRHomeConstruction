package middleware

import (
	"math"
	"net/http"
	"strconv"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

// KeyFunc выбирает, кого ограничивать: IP клиента, пользователя и т.п.
// Пустой ключ — запрос не ограничивается.
type KeyFunc func(c *gin.Context) string

// ByClientIP — ключ по IP клиента. Адрес из X-Forwarded-For учитывается только от
// доверенных прокси (engine.SetTrustedProxies), иначе берётся адрес соединения:
// подделать заголовок и обойти лимит нельзя.
func ByClientIP(c *gin.Context) string { return c.ClientIP() }

// ByUserID — ключ по пользователю из токена (только на защищённых маршрутах).
func ByUserID(c *gin.Context) string { return GetUserID(c) }

type rateBucket struct {
	count      int
	windowFrom time.Time
}

// rateLimiter — «N запросов в окно» на ключ. Счётчики в памяти (при нескольких
// репликах лимит действует на реплику). Устаревшие окна вычищаются по ходу работы,
// без фоновых горутин.
type rateLimiter struct {
	mu        sync.Mutex
	buckets   map[string]*rateBucket
	max       int
	window    time.Duration
	lastSweep time.Time
	now       func() time.Time
}

func newRateLimiter(maxRequests int, window time.Duration) *rateLimiter {
	return &rateLimiter{buckets: make(map[string]*rateBucket), max: maxRequests, window: window, now: time.Now}
}

// hit учитывает запрос и возвращает, сколько ждать до нового окна (0 — запрос разрешён).
func (l *rateLimiter) hit(key string) time.Duration {
	l.mu.Lock()
	defer l.mu.Unlock()

	now := l.now()
	if now.Sub(l.lastSweep) > l.window {
		for k, b := range l.buckets {
			if now.Sub(b.windowFrom) > l.window {
				delete(l.buckets, k)
			}
		}
		l.lastSweep = now
	}

	b, ok := l.buckets[key]
	if !ok || now.Sub(b.windowFrom) > l.window {
		b = &rateBucket{windowFrom: now}
		l.buckets[key] = b
	}
	b.count++
	if b.count <= l.max {
		return 0
	}
	return b.windowFrom.Add(l.window).Sub(now)
}

// RateLimit ограничивает число запросов с одного IP.
func RateLimit(maxRequests int, window time.Duration) gin.HandlerFunc {
	return RateLimitBy(maxRequests, window, ByClientIP)
}

// RateLimitBy ограничивает число запросов на ключ; при превышении — 429 с Retry-After.
func RateLimitBy(maxRequests int, window time.Duration, key KeyFunc) gin.HandlerFunc {
	limiter := newRateLimiter(maxRequests, window)
	return func(c *gin.Context) {
		k := key(c)
		if k == "" {
			c.Next()
			return
		}
		if wait := limiter.hit(k); wait > 0 {
			c.Header("Retry-After", strconv.Itoa(int(math.Ceil(wait.Seconds()))))
			c.AbortWithStatusJSON(http.StatusTooManyRequests, gin.H{"error": "too many requests, slow down"})
			return
		}
		c.Next()
	}
}

// WritesOnly применяет обработчик только к изменяющим запросам (не GET/HEAD/OPTIONS).
func WritesOnly(h gin.HandlerFunc) gin.HandlerFunc {
	return func(c *gin.Context) {
		switch c.Request.Method {
		case http.MethodGet, http.MethodHead, http.MethodOptions:
			c.Next()
		default:
			h(c)
		}
	}
}
