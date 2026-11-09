package services

import (
	"context"
	"fmt"
	"strings"
	"sync"
	"time"

	"github.com/execada/VRHomeConstruction/backend/internal/models"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
)

// duplicateKeyError имитирует нарушение уникального индекса MongoDB (E11000).
func duplicateKeyError() error {
	return mongo.WriteException{WriteErrors: mongo.WriteErrors{{Code: 11000, Message: "E11000 duplicate key error"}}}
}

// --- project repo fake ---

type fakeProjectRepo struct {
	byID          map[string]*models.Project
	lastUpdate    bson.M
	updates       int
	numbersIssued int
	lastPage      int64
	lastLimit     int64

	findAllErr    error
	countErr      error
	findErr       error
	nextNumberErr error
	insertErr     error
	updateErr     error
	deleteErr     error
	// count — подменяет число проектов пользователя (проверка квоты); <0 — считать по byID.
	count int64
}

func newFakeProjectRepo() *fakeProjectRepo {
	return &fakeProjectRepo{byID: map[string]*models.Project{}, count: -1}
}

func (f *fakeProjectRepo) Count(_ context.Context, userID string) (int64, error) {
	if f.countErr != nil {
		return 0, f.countErr
	}
	if f.count >= 0 {
		return f.count, nil
	}
	var n int64
	for _, p := range f.byID {
		if p.UserID == userID {
			n++
		}
	}
	return n, nil
}

func (f *fakeProjectRepo) FindAll(_ context.Context, filter bson.M, page, limit int64) ([]models.Project, int64, error) {
	if f.findAllErr != nil {
		return nil, 0, f.findAllErr
	}
	f.lastPage, f.lastLimit = page, limit
	var out []models.Project
	for _, p := range f.byID {
		if uid, ok := filter["userId"].(string); ok && p.UserID != uid {
			continue
		}
		if st, ok := filter["status"].(string); ok && p.Status != st {
			continue
		}
		out = append(out, *p)
	}
	return out, int64(len(out)), nil
}

func (f *fakeProjectRepo) FindByID(_ context.Context, id string) (*models.Project, error) {
	if f.findErr != nil {
		return nil, f.findErr
	}
	if p, ok := f.byID[id]; ok {
		return p, nil
	}
	return nil, nil
}

func (f *fakeProjectRepo) NextNumber(_ context.Context, userID string) (int, error) {
	if f.nextNumberErr != nil {
		return 0, f.nextNumberErr
	}
	f.numbersIssued++
	n := 0
	for _, p := range f.byID {
		if p.UserID == userID {
			n++
		}
	}
	return n + 1, nil
}

func (f *fakeProjectRepo) Insert(_ context.Context, p *models.Project) error {
	if f.insertErr != nil {
		return f.insertErr
	}
	f.byID[p.ID] = p
	return nil
}

// Update применяет $set к новой копии документа владельца, как это сделала бы Mongo.
func (f *fakeProjectRepo) Update(_ context.Context, id, userID string, update bson.M) (bool, error) {
	if f.updateErr != nil {
		return false, f.updateErr
	}
	f.lastUpdate = update
	f.updates++
	p, ok := f.byID[id]
	if !ok || p.UserID != userID {
		return false, nil
	}
	f.byID[id] = applyProjectSet(*p, update)
	return true, nil
}

func (f *fakeProjectRepo) Delete(_ context.Context, id, userID string) (bool, error) {
	if f.deleteErr != nil {
		return false, f.deleteErr
	}
	p, ok := f.byID[id]
	if !ok || p.UserID != userID {
		return false, nil
	}
	delete(f.byID, id)
	return true, nil
}

// applyProjectSet переносит поля $set в копию проекта. Неизвестный ключ или
// неожиданный тип значения — ошибка в сервисе, поэтому фейк паникует.
func applyProjectSet(p models.Project, set bson.M) *models.Project {
	for key, value := range set {
		switch key {
		case "name":
			p.Name = value.(string)
		case "status":
			p.Status = value.(string)
		case "description":
			p.Description = value.(string)
		case "tags":
			p.Tags = value.([]string)
		case "favorite":
			p.Favorite = value.(bool)
		case "thumbnail":
			p.Thumbnail = value.(string)
		case "roomData":
			p.RoomData = value.(models.RoomData)
		case "template":
			p.Template = value.(*string)
		case "playerPosition":
			p.PlayerPosition = value.([]float64)
		case "playerRotation":
			p.PlayerRotation = value.([]float64)
		case "updatedAt":
			p.UpdatedAt = value.(time.Time)
		default:
			panic(fmt.Sprintf("fakeProjectRepo: unexpected $set key %q (%T)", key, value))
		}
	}
	return &p
}

// --- folder repo fake ---

type fakeFolderRepo struct {
	byID    map[string]*models.Folder
	updated *models.Folder
}

func newFakeFolderRepo() *fakeFolderRepo {
	return &fakeFolderRepo{byID: map[string]*models.Folder{}}
}

func (f *fakeFolderRepo) FindAll(_ context.Context, userID string) ([]models.Folder, error) {
	var out []models.Folder
	for _, fo := range f.byID {
		if fo.UserID == userID {
			out = append(out, *fo)
		}
	}
	return out, nil
}

func (f *fakeFolderRepo) FindByID(_ context.Context, id string) (*models.Folder, error) {
	if fo, ok := f.byID[id]; ok {
		return fo, nil
	}
	return nil, nil
}

func (f *fakeFolderRepo) Insert(_ context.Context, folder *models.Folder) error {
	f.byID[folder.ID] = folder
	return nil
}

func (f *fakeFolderRepo) Update(_ context.Context, id, userID string, folder *models.Folder) (bool, error) {
	if existing, ok := f.byID[id]; !ok || existing.UserID != userID {
		return false, nil
	}
	f.byID[id] = folder
	f.updated = folder
	return true, nil
}

func (f *fakeFolderRepo) Delete(_ context.Context, id, userID string) (bool, error) {
	if existing, ok := f.byID[id]; !ok || existing.UserID != userID {
		return false, nil
	}
	delete(f.byID, id)
	return true, nil
}

// RemoveProject — фейк очистки папок при удалении проекта.
func (f *fakeFolderRepo) RemoveProject(_ context.Context, userID, projectID string) error {
	for id, fo := range f.byID {
		if fo.UserID != userID {
			continue
		}
		kept := make([]string, 0, len(fo.ProjectIDs))
		for _, p := range fo.ProjectIDs {
			if p != projectID {
				kept = append(kept, p)
			}
		}
		copyFolder := *fo
		copyFolder.ProjectIDs = kept
		f.byID[id] = &copyFolder
	}
	return nil
}

// --- layout repo fake ---

type fakeLayoutRepo struct {
	byID    map[string]*models.Layout
	updated *models.Layout

	findAllErr error
	findErr    error
	insertErr  error
	updateErr  error
	deleteErr  error
}

func newFakeLayoutRepo() *fakeLayoutRepo {
	return &fakeLayoutRepo{byID: map[string]*models.Layout{}}
}

func (f *fakeLayoutRepo) FindAll(_ context.Context, userID string) ([]models.Layout, error) {
	if f.findAllErr != nil {
		return nil, f.findAllErr
	}
	var out []models.Layout
	for _, l := range f.byID {
		if l.UserID == userID {
			out = append(out, *l)
		}
	}
	return out, nil
}

func (f *fakeLayoutRepo) FindByID(_ context.Context, id string) (*models.Layout, error) {
	if f.findErr != nil {
		return nil, f.findErr
	}
	if l, ok := f.byID[id]; ok {
		return l, nil
	}
	return nil, nil
}

func (f *fakeLayoutRepo) Insert(_ context.Context, layout *models.Layout) error {
	if f.insertErr != nil {
		return f.insertErr
	}
	f.byID[layout.ID] = layout
	return nil
}

func (f *fakeLayoutRepo) Update(_ context.Context, id, userID string, layout *models.Layout) (bool, error) {
	if f.updateErr != nil {
		return false, f.updateErr
	}
	if existing, ok := f.byID[id]; !ok || existing.UserID != userID {
		return false, nil
	}
	f.byID[id] = layout
	f.updated = layout
	return true, nil
}

func (f *fakeLayoutRepo) Delete(_ context.Context, id, userID string) (bool, error) {
	if f.deleteErr != nil {
		return false, f.deleteErr
	}
	if existing, ok := f.byID[id]; !ok || existing.UserID != userID {
		return false, nil
	}
	delete(f.byID, id)
	return true, nil
}

// --- user repo fake ---

type fakeUserRepo struct {
	byEmail    map[string]*models.User
	byID       map[string]*models.User
	byUsername map[string]*models.User

	findByEmailErr    error
	findByUsernameErr error
	findByIDErr       error
	insertErr         error
	updateErr         error
	updateEmailErr    error
	sessionErr        error
}

func newFakeUserRepo() *fakeUserRepo {
	return &fakeUserRepo{byEmail: map[string]*models.User{}, byID: map[string]*models.User{}, byUsername: map[string]*models.User{}}
}

func (f *fakeUserRepo) FindByUsername(_ context.Context, username string) (*models.User, error) {
	if f.findByUsernameErr != nil {
		return nil, f.findByUsernameErr
	}
	if u, ok := f.byUsername[emailKey(username)]; ok {
		out := *u
		return &out, nil
	}
	return nil, nil
}

// UpdateCredentials меняет пароль и роль в новой копии пользователя.
func (f *fakeUserRepo) UpdateCredentials(_ context.Context, id, passwordHash, role string) (*models.User, error) {
	if f.updateErr != nil {
		return nil, f.updateErr
	}
	u, ok := f.byID[id]
	if !ok {
		return nil, nil
	}
	updated := *u
	updated.PasswordHash, updated.Role = passwordHash, role
	f.store(&updated)
	out := updated
	return &out, nil
}

// UpdatePassword меняет пароль и увеличивает версию сессий в новой копии пользователя —
// только пока у него эта почта (как фильтр {_id, email} в репозитории).
func (f *fakeUserRepo) UpdatePassword(_ context.Context, id, email, passwordHash string) (*models.User, error) {
	if f.updateErr != nil {
		return nil, f.updateErr
	}
	u, ok := f.byID[id]
	if !ok || u.Email != emailKey(email) {
		return nil, nil
	}
	updated := *u
	updated.PasswordHash = passwordHash
	updated.TokenVersion++
	f.store(&updated)
	out := updated
	return &out, nil
}

func (f *fakeUserRepo) SessionVersion(_ context.Context, id string) (int64, bool, error) {
	if f.sessionErr != nil {
		return 0, false, f.sessionErr
	}
	u, ok := f.byID[id]
	if !ok {
		return 0, false, nil
	}
	return u.TokenVersion, true, nil
}

// store раскладывает пользователя по индексам фейка (пустая почта/логин не индексируются).
func (f *fakeUserRepo) store(u *models.User) {
	f.byID[u.ID] = u
	if u.Email != "" {
		f.byEmail[emailKey(u.Email)] = u
	}
	if u.Username != "" {
		f.byUsername[emailKey(u.Username)] = u
	}
}

func emailKey(email string) string { return strings.ToLower(strings.TrimSpace(email)) }

func (f *fakeUserRepo) FindByEmail(_ context.Context, email string) (*models.User, error) {
	if f.findByEmailErr != nil {
		return nil, f.findByEmailErr
	}
	if u, ok := f.byEmail[emailKey(email)]; ok {
		return u, nil
	}
	return nil, nil
}

func (f *fakeUserRepo) FindByID(_ context.Context, id string) (*models.User, error) {
	if f.findByIDErr != nil {
		return nil, f.findByIDErr
	}
	if u, ok := f.byID[id]; ok {
		return u, nil
	}
	return nil, nil
}

func (f *fakeUserRepo) Insert(_ context.Context, u *models.User) error {
	if f.insertErr != nil {
		return f.insertErr
	}
	f.store(u)
	return nil
}

func (f *fakeUserRepo) UpdateName(_ context.Context, id, name string) (*models.User, error) {
	if f.updateErr != nil {
		return nil, f.updateErr
	}
	u, ok := f.byID[id]
	if !ok {
		return nil, nil
	}
	updated := *u
	updated.Name = name
	f.byID[id] = &updated
	f.byEmail[emailKey(updated.Email)] = &updated
	out := updated
	return &out, nil
}

// UpdateEmail соблюдает уникальность email, как уникальный индекс users.email.
func (f *fakeUserRepo) UpdateEmail(_ context.Context, id, email string) (*models.User, error) {
	if f.updateEmailErr != nil {
		return nil, f.updateEmailErr
	}
	u, ok := f.byID[id]
	if !ok {
		return nil, nil
	}
	key := emailKey(email)
	if other, taken := f.byEmail[key]; taken && other.ID != id {
		return nil, duplicateKeyError()
	}
	updated := *u
	updated.Email = key
	delete(f.byEmail, emailKey(u.Email))
	f.byID[id] = &updated
	f.byEmail[key] = &updated
	out := updated
	return &out, nil
}

// --- verification repo fake ---

type fakeVerificationRepo struct {
	mu      sync.Mutex
	records map[string]*models.VerificationRecord
	deleted bool

	findErr    error
	upsertErr  error
	deleteErr  error
	consumeErr error
	claimErr   error
}

func newFakeVerificationRepo() *fakeVerificationRepo {
	return &fakeVerificationRepo{records: map[string]*models.VerificationRecord{}}
}

func verKey(email, purpose string) string { return email + "|" + purpose }

// Upsert сохраняет копию записи с обнулённым счётчиком, как $set в Mongo.
func (f *fakeVerificationRepo) Upsert(_ context.Context, r *models.VerificationRecord) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.upsertErr != nil {
		return f.upsertErr
	}
	stored := *r
	stored.Attempts = 0
	f.records[verKey(r.Email, r.Purpose)] = &stored
	return nil
}

func (f *fakeVerificationRepo) FindValid(_ context.Context, email, purpose string) (*models.VerificationRecord, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.findErr != nil {
		return nil, f.findErr
	}
	r, ok := f.records[verKey(email, purpose)]
	if !ok || time.Now().After(r.ExpiresAt) {
		return nil, nil
	}
	out := *r
	return &out, nil
}

// ConsumeAttempt повторяет атомарный FindOneAndUpdate репозитория под мьютексом.
func (f *fakeVerificationRepo) ConsumeAttempt(_ context.Context, key models.VerificationKey, maxAttempts int) (*models.VerificationRecord, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.consumeErr != nil {
		return nil, f.consumeErr
	}
	r, ok := f.records[verKey(key.Email, key.Purpose)]
	if !ok || time.Now().After(r.ExpiresAt) || r.Attempts >= maxAttempts {
		return nil, nil
	}
	if (key.UserID != "" && r.UserID != key.UserID) || (key.TokenHash != "" && r.TokenHash != key.TokenHash) {
		return nil, nil
	}
	r.Attempts++
	out := *r
	return &out, nil
}

// Claim удаляет запись, только если у неё тот же id и хэш кода (как фильтр DeleteOne).
func (f *fakeVerificationRepo) Claim(_ context.Context, id, codeHash string) (bool, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.claimErr != nil {
		return false, f.claimErr
	}
	for key, r := range f.records {
		if r.ID == id && r.CodeHash == codeHash {
			delete(f.records, key)
			return true, nil
		}
	}
	return false, nil
}

func (f *fakeVerificationRepo) Delete(_ context.Context, email, purpose string) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.deleteErr != nil {
		return f.deleteErr
	}
	delete(f.records, verKey(email, purpose))
	f.deleted = true
	return nil
}

// --- email sender fake (no shared state mutation → safe with the async send goroutine) ---

type fakeSender struct {
	logOnly bool
}

func (f *fakeSender) SendVerificationCode(_, _, _ string) error { return nil }
func (f *fakeSender) LogOnly() bool                             { return f.logOnly }
