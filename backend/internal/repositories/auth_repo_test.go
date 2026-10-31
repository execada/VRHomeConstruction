package repositories

import (
	"sync"
	"testing"
	"time"

	"github.com/execada/VRHomeConstruction/backend/internal/models"
	"go.mongodb.org/mongo-driver/mongo"
)

const maxAttempts = 5

func TestUserRepoNormalizesAndEnforcesUniqueEmail(t *testing.T) {
	ctx := requireDB(t, "users")
	repo := NewUserRepo(testDB)

	if err := repo.Insert(ctx, &models.User{ID: "u1", Name: "U", Email: "user@example.com"}); err != nil {
		t.Fatalf("insert: %v", err)
	}
	err := repo.Insert(ctx, &models.User{ID: "u2", Name: "Dup", Email: "user@example.com"})
	if !mongo.IsDuplicateKeyError(err) {
		t.Fatalf("the unique index must reject a duplicate email, got %v", err)
	}

	got, err := repo.FindByEmail(ctx, "  USER@Example.com ")
	if err != nil || got == nil || got.ID != "u1" {
		t.Fatalf("lookup must normalize the address, got %+v (%v)", got, err)
	}
	if got, err := repo.FindByEmail(ctx, "ghost@example.com"); err != nil || got != nil {
		t.Fatalf("an unknown address must be nil, got %+v (%v)", got, err)
	}

	renamed, err := repo.UpdateName(ctx, "u1", "Пётр")
	if err != nil || renamed.Name != "Пётр" {
		t.Fatalf("UpdateName must return the updated user, got %+v (%v)", renamed, err)
	}
	if err := repo.Insert(ctx, &models.User{ID: "u3", Name: "Other", Email: "other@example.com"}); err != nil {
		t.Fatalf("insert: %v", err)
	}
	if _, err := repo.UpdateEmail(ctx, "u3", "User@Example.com"); !mongo.IsDuplicateKeyError(err) {
		t.Fatalf("changing to a taken email must hit the unique index, got %v", err)
	}
	if moved, err := repo.UpdateEmail(ctx, "u3", " New@Example.com "); err != nil || moved.Email != "new@example.com" {
		t.Fatalf("UpdateEmail must store the normalized address, got %+v (%v)", moved, err)
	}
	if got, err := repo.UpdateName(ctx, "ghost", "X"); err != nil || got != nil {
		t.Fatalf("updating a missing user must return nil, got %+v (%v)", got, err)
	}
	if got, err := repo.FindByID(ctx, "u1"); err != nil || got.Email != "user@example.com" {
		t.Fatalf("FindByID: got %+v (%v)", got, err)
	}
}

func verification(email, userID, tokenHash string, ttl time.Duration) *models.VerificationRecord {
	return &models.VerificationRecord{
		ID: "id-" + email, Email: email, Purpose: models.VerificationPurposeRegister,
		CodeHash: "hash", UserID: userID, TokenHash: tokenHash,
		ExpiresAt: time.Now().Add(ttl), LastSentAt: time.Now(),
	}
}

func TestVerificationRepoUpsertResetsAttempts(t *testing.T) {
	ctx := requireDB(t, "verification_codes")
	repo := NewVerificationRepo(testDB)
	key := models.VerificationKey{Email: "a@example.com", Purpose: models.VerificationPurposeRegister}

	if err := repo.Upsert(ctx, verification("a@example.com", "", "t1", time.Minute)); err != nil {
		t.Fatalf("upsert: %v", err)
	}
	if _, err := repo.ConsumeAttempt(ctx, key, maxAttempts); err != nil {
		t.Fatalf("consume: %v", err)
	}
	second := verification("a@example.com", "", "t2", time.Minute)
	second.ID = "another-id"
	if err := repo.Upsert(ctx, second); err != nil {
		t.Fatalf("second upsert: %v", err)
	}

	got, err := repo.FindValid(ctx, "a@example.com", models.VerificationPurposeRegister)
	if err != nil || got == nil {
		t.Fatalf("FindValid: %+v (%v)", got, err)
	}
	if got.Attempts != 0 || got.TokenHash != "t2" || got.ID != "id-a@example.com" {
		t.Fatalf("a new code must reset attempts and rebind the token in place, got %+v", got)
	}
}

func TestVerificationRepoIgnoresExpiredCodes(t *testing.T) {
	ctx := requireDB(t, "verification_codes")
	repo := NewVerificationRepo(testDB)
	if err := repo.Upsert(ctx, verification("old@example.com", "", "", -time.Minute)); err != nil {
		t.Fatalf("upsert: %v", err)
	}
	if got, err := repo.FindValid(ctx, "old@example.com", models.VerificationPurposeRegister); err != nil || got != nil {
		t.Fatalf("an expired code must not be found, got %+v (%v)", got, err)
	}
	key := models.VerificationKey{Email: "old@example.com", Purpose: models.VerificationPurposeRegister}
	if got, err := repo.ConsumeAttempt(ctx, key, maxAttempts); err != nil || got != nil {
		t.Fatalf("an expired code must not be consumable, got %+v (%v)", got, err)
	}
}

func TestVerificationRepoConsumeAttemptMatchesRequester(t *testing.T) {
	ctx := requireDB(t, "verification_codes")
	repo := NewVerificationRepo(testDB)
	if err := repo.Upsert(ctx, verification("a@example.com", "u1", "token-hash", time.Minute)); err != nil {
		t.Fatalf("upsert: %v", err)
	}
	base := models.VerificationKey{Email: "a@example.com", Purpose: models.VerificationPurposeRegister}

	for name, key := range map[string]models.VerificationKey{
		"foreign user":  {Email: base.Email, Purpose: base.Purpose, UserID: "u2"},
		"foreign token": {Email: base.Email, Purpose: base.Purpose, TokenHash: "other"},
		"other purpose": {Email: base.Email, Purpose: models.VerificationPurposeChangeEmail},
	} {
		if got, err := repo.ConsumeAttempt(ctx, key, maxAttempts); err != nil || got != nil {
			t.Fatalf("%s: expected no match, got %+v (%v)", name, got, err)
		}
	}

	own := models.VerificationKey{Email: base.Email, Purpose: base.Purpose, UserID: "u1", TokenHash: "token-hash"}
	got, err := repo.ConsumeAttempt(ctx, own, maxAttempts)
	if err != nil || got == nil || got.Attempts != 1 {
		t.Fatalf("the requester must consume an attempt, got %+v (%v)", got, err)
	}

	if err := repo.Delete(ctx, base.Email, base.Purpose); err != nil {
		t.Fatalf("delete: %v", err)
	}
	if got, err := repo.FindValid(ctx, base.Email, base.Purpose); err != nil || got != nil {
		t.Fatalf("a deleted code must be gone, got %+v (%v)", got, err)
	}
}

// Параллельные попытки не превышают лимит: ровно maxAttempts запросов получают запись.
func TestVerificationRepoConsumeAttemptIsAtomic(t *testing.T) {
	ctx := requireDB(t, "verification_codes")
	repo := NewVerificationRepo(testDB)
	if err := repo.Upsert(ctx, verification("race@example.com", "", "", time.Minute)); err != nil {
		t.Fatalf("upsert: %v", err)
	}
	key := models.VerificationKey{Email: "race@example.com", Purpose: models.VerificationPurposeRegister}

	const callers = 25
	var wg sync.WaitGroup
	var mu sync.Mutex
	granted := 0
	for i := 0; i < callers; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			got, err := repo.ConsumeAttempt(ctx, key, maxAttempts)
			if err != nil {
				t.Errorf("consume: %v", err)
				return
			}
			if got != nil {
				mu.Lock()
				granted++
				mu.Unlock()
			}
		}()
	}
	wg.Wait()

	if granted != maxAttempts {
		t.Fatalf("expected exactly %d granted attempts, got %d", maxAttempts, granted)
	}
	rec, err := repo.FindValid(ctx, key.Email, key.Purpose)
	if err != nil || rec.Attempts != maxAttempts {
		t.Fatalf("the counter must stop at %d, got %+v (%v)", maxAttempts, rec, err)
	}
}
