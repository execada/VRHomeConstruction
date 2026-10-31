package services

import (
	"sync"
	"time"
)

// failureGuard считает неудачные попытки по ключу (адрес почты при входе, пользователь
// при проверке пароля) в окне и блокирует ключ после max неудач. Работает в памяти
// процесса (при нескольких репликах — на реплику), устаревшие записи вычищаются по ходу.
type failureGuard struct {
	mu        sync.Mutex
	max       int
	window    time.Duration
	entries   map[string]failureEntry
	lastSweep time.Time
	now       func() time.Time
}

type failureEntry struct {
	count int
	since time.Time
}

func newFailureGuard(max int, window time.Duration) *failureGuard {
	return &failureGuard{max: max, window: window, entries: make(map[string]failureEntry), now: time.Now}
}

// Allow сообщает, можно ли сейчас пробовать для ключа.
func (g *failureGuard) Allow(key string) bool {
	g.mu.Lock()
	defer g.mu.Unlock()
	e, ok := g.entries[key]
	return !ok || g.expired(e) || e.count < g.max
}

// Fail учитывает неудачную попытку.
func (g *failureGuard) Fail(key string) {
	g.mu.Lock()
	defer g.mu.Unlock()
	g.sweep()
	e, ok := g.entries[key]
	if !ok || g.expired(e) {
		e = failureEntry{since: g.now()}
	}
	e.count++
	g.entries[key] = e
}

// Reset сбрасывает счётчик после успешной попытки.
func (g *failureGuard) Reset(key string) {
	g.mu.Lock()
	defer g.mu.Unlock()
	delete(g.entries, key)
}

func (g *failureGuard) expired(e failureEntry) bool {
	return g.now().Sub(e.since) > g.window
}

// sweep раз в окно удаляет устаревшие записи (вызывается под мьютексом).
func (g *failureGuard) sweep() {
	now := g.now()
	if now.Sub(g.lastSweep) < g.window {
		return
	}
	for k, e := range g.entries {
		if g.expired(e) {
			delete(g.entries, k)
		}
	}
	g.lastSweep = now
}
