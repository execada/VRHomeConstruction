package services

// Пагинация списков: размер страницы по умолчанию и допустимые границы.
const (
	DefaultPageLimit int64 = 20
	maxPageLimit     int64 = 100
	// Верхняя граница номера страницы: skip = (page-1)*limit не переполнит int64.
	maxPage int64 = 1_000_000
)

// NormalizePagination приводит номер страницы к [1, maxPage], размер — к [1, maxPageLimit].
func NormalizePagination(page, limit int64) (int64, int64) {
	return clampInt64(page, 1, maxPage), clampInt64(limit, 1, maxPageLimit)
}

func clampInt64(v, lo, hi int64) int64 {
	return max(lo, min(v, hi))
}
