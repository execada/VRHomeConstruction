package handlers

import (
	"context"
	"strings"
	"time"

	"github.com/execada/VRHomeConstruction/backend/internal/models"
	"go.mongodb.org/mongo-driver/bson"
)

// memProjectRepo — минимальное хранилище проектов для HTTP-тестов.
// err (если задан) возвращают все методы — так проверяется ответ 500.
type memProjectRepo struct {
	byID map[string]*models.Project
	err  error
}

func newMemProjectRepo(projects ...*models.Project) *memProjectRepo {
	repo := &memProjectRepo{byID: map[string]*models.Project{}}
	for _, p := range projects {
		repo.byID[p.ID] = p
	}
	return repo
}

func (r *memProjectRepo) FindAll(_ context.Context, filter bson.M, _, _ int64) ([]models.Project, int64, error) {
	if r.err != nil {
		return nil, 0, r.err
	}
	var out []models.Project
	for _, p := range r.byID {
		if p.UserID == filter["userId"] {
			item := *p
			item.RoomData = nil // как проекция {roomData: 0} в настоящем репозитории
			out = append(out, item)
		}
	}
	return out, int64(len(out)), nil
}

func (r *memProjectRepo) Count(_ context.Context, userID string) (int64, error) {
	var n int64
	for _, p := range r.byID {
		if p.UserID == userID {
			n++
		}
	}
	return n, r.err
}

func (r *memProjectRepo) FindByID(_ context.Context, id string) (*models.Project, error) {
	if r.err != nil {
		return nil, r.err
	}
	return r.byID[id], nil
}

func (r *memProjectRepo) NextNumber(context.Context, string) (int, error) {
	return len(r.byID) + 1, r.err
}

func (r *memProjectRepo) Insert(_ context.Context, p *models.Project) error {
	if r.err != nil {
		return r.err
	}
	r.byID[p.ID] = p
	return nil
}

// Update/Delete, как настоящий репозиторий, действуют только на проект владельца.
func (r *memProjectRepo) Update(_ context.Context, id, userID string, _ bson.M) (bool, error) {
	if r.err != nil {
		return false, r.err
	}
	return r.owned(id, userID), nil
}

func (r *memProjectRepo) Delete(_ context.Context, id, userID string) (bool, error) {
	if r.err != nil {
		return false, r.err
	}
	if !r.owned(id, userID) {
		return false, nil
	}
	delete(r.byID, id)
	return true, nil
}

func (r *memProjectRepo) owned(id, userID string) bool {
	p, ok := r.byID[id]
	return ok && p.UserID == userID
}

// memLayoutRepo — минимальное хранилище раскладок.
type memLayoutRepo struct {
	byID map[string]*models.Layout
}

func (r *memLayoutRepo) FindAll(_ context.Context, userID string) ([]models.Layout, error) {
	var out []models.Layout
	for _, l := range r.byID {
		if l.UserID == userID {
			item := *l
			item.RoomData = nil
			out = append(out, item)
		}
	}
	return out, nil
}

func (r *memLayoutRepo) FindByID(_ context.Context, id string) (*models.Layout, error) {
	return r.byID[id], nil
}

func (r *memLayoutRepo) Insert(_ context.Context, l *models.Layout) error {
	r.byID[l.ID] = l
	return nil
}

func (r *memLayoutRepo) Update(_ context.Context, id, userID string, l *models.Layout) (bool, error) {
	if !r.owned(id, userID) {
		return false, nil
	}
	r.byID[id] = l
	return true, nil
}

func (r *memLayoutRepo) Delete(_ context.Context, id, userID string) (bool, error) {
	if !r.owned(id, userID) {
		return false, nil
	}
	delete(r.byID, id)
	return true, nil
}

func (r *memLayoutRepo) owned(id, userID string) bool {
	l, ok := r.byID[id]
	return ok && l.UserID == userID
}

// memUserRepo / memVerificationRepo / nopSender — зависимости AuthService.
type memUserRepo struct {
	byID map[string]*models.User
}

func (r *memUserRepo) FindByEmail(_ context.Context, email string) (*models.User, error) {
	for _, u := range r.byID {
		if u.Email == strings.ToLower(strings.TrimSpace(email)) {
			return u, nil
		}
	}
	return nil, nil
}

func (r *memUserRepo) FindByUsername(_ context.Context, username string) (*models.User, error) {
	for _, u := range r.byID {
		if u.Username != "" && u.Username == strings.ToLower(strings.TrimSpace(username)) {
			return u, nil
		}
	}
	return nil, nil
}

func (r *memUserRepo) FindByID(_ context.Context, id string) (*models.User, error) {
	return r.byID[id], nil
}

func (r *memUserRepo) Insert(_ context.Context, u *models.User) error {
	r.byID[u.ID] = u
	return nil
}

func (r *memUserRepo) UpdateName(_ context.Context, id, name string) (*models.User, error) {
	return r.update(id, func(u *models.User) { u.Name = name })
}

func (r *memUserRepo) UpdateEmail(_ context.Context, id, email string) (*models.User, error) {
	return r.update(id, func(u *models.User) { u.Email = email })
}

func (r *memUserRepo) UpdatePassword(_ context.Context, id, email, passwordHash string) (*models.User, error) {
	if u, ok := r.byID[id]; !ok || u.Email != email {
		return nil, nil
	}
	return r.update(id, func(u *models.User) {
		u.PasswordHash = passwordHash
		u.TokenVersion++
	})
}

func (r *memUserRepo) SessionVersion(_ context.Context, id string) (int64, bool, error) {
	u, ok := r.byID[id]
	if !ok {
		return 0, false, nil
	}
	return u.TokenVersion, true, nil
}

func (r *memUserRepo) update(id string, change func(*models.User)) (*models.User, error) {
	u, ok := r.byID[id]
	if !ok {
		return nil, nil
	}
	updated := *u
	change(&updated)
	r.byID[id] = &updated
	return &updated, nil
}

type memVerificationRepo struct {
	records map[string]*models.VerificationRecord
}

func verificationKey(email, purpose string) string { return email + "|" + purpose }

func (r *memVerificationRepo) Upsert(_ context.Context, rec *models.VerificationRecord) error {
	stored := *rec
	stored.Attempts = 0
	r.records[verificationKey(rec.Email, rec.Purpose)] = &stored
	return nil
}

func (r *memVerificationRepo) FindValid(_ context.Context, email, purpose string) (*models.VerificationRecord, error) {
	rec, ok := r.records[verificationKey(email, purpose)]
	if !ok || time.Now().After(rec.ExpiresAt) {
		return nil, nil
	}
	return rec, nil
}

// ConsumeAttempt повторяет фильтр настоящего репозитория: живая запись, попытки не
// исчерпаны, совпадают userId/tokenHash (если заданы в ключе).
func (r *memVerificationRepo) ConsumeAttempt(_ context.Context, key models.VerificationKey, maxAttempts int) (*models.VerificationRecord, error) {
	rec, ok := r.records[verificationKey(key.Email, key.Purpose)]
	switch {
	case !ok, time.Now().After(rec.ExpiresAt), rec.Attempts >= maxAttempts,
		key.UserID != "" && rec.UserID != key.UserID,
		key.TokenHash != "" && rec.TokenHash != key.TokenHash:
		return nil, nil
	}
	rec.Attempts++
	out := *rec
	return &out, nil
}

func (r *memVerificationRepo) Claim(_ context.Context, id, codeHash string) (bool, error) {
	for key, rec := range r.records {
		if rec.ID == id && rec.CodeHash == codeHash {
			delete(r.records, key)
			return true, nil
		}
	}
	return false, nil
}

func (r *memVerificationRepo) Delete(_ context.Context, email, purpose string) error {
	delete(r.records, verificationKey(email, purpose))
	return nil
}

type nopSender struct{}

func (nopSender) SendVerificationCode(_, _, _ string) error { return nil }
func (nopSender) LogOnly() bool                             { return true }

// memFolderRepo — минимальное хранилище папок; err (если задан) возвращает FindAll.
type memFolderRepo struct {
	byID map[string]*models.Folder
	err  error
}

func (r *memFolderRepo) FindAll(_ context.Context, userID string) ([]models.Folder, error) {
	if r.err != nil {
		return nil, r.err
	}
	var out []models.Folder
	for _, f := range r.byID {
		if f.UserID == userID {
			out = append(out, *f)
		}
	}
	return out, nil
}

func (r *memFolderRepo) FindByID(_ context.Context, id string) (*models.Folder, error) {
	return r.byID[id], nil
}

func (r *memFolderRepo) Insert(_ context.Context, f *models.Folder) error {
	r.byID[f.ID] = f
	return nil
}

func (r *memFolderRepo) Update(_ context.Context, id, userID string, f *models.Folder) (bool, error) {
	if existing, ok := r.byID[id]; !ok || existing.UserID != userID {
		return false, nil
	}
	r.byID[id] = f
	return true, nil
}

func (r *memFolderRepo) Delete(_ context.Context, id, userID string) (bool, error) {
	if existing, ok := r.byID[id]; !ok || existing.UserID != userID {
		return false, nil
	}
	delete(r.byID, id)
	return true, nil
}
