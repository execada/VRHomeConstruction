package email

import "strings"

// MaskAddress скрывает почту в логах: «an***@example.com» (персональные данные не утекают
// в логи, а по домену и первым буквам всё ещё можно разобраться в инциденте).
func MaskAddress(addr string) string {
	at := strings.LastIndex(addr, "@")
	if at <= 0 {
		return "***"
	}
	local := []rune(addr[:at])
	keep := 2
	if len(local) <= 2 {
		keep = 1
	}
	return string(local[:keep]) + "***" + addr[at:]
}
