package repositories

import (
	"slices"
	"sync"
	"testing"
	"time"

	"github.com/execada/VRHomeConstruction/backend/internal/models"
	"go.mongodb.org/mongo-driver/bson"
)

func project(id, owner, status string, updated time.Time) *models.Project {
	return &models.Project{
		ID: id, Name: "P " + id, UserID: owner, Status: status, Tags: []string{},
		CreatedAt: updated, UpdatedAt: updated,
		RoomData: models.RoomData{"schemaVersion": 1.0},
	}
}

func TestProjectRepoListsPagesWithoutScenes(t *testing.T) {
	ctx := requireDB(t, "projects")
	repo := NewProjectRepo(testDB)
	base := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	for i, p := range []*models.Project{
		project("a", "owner", "active", base),
		project("b", "owner", "archived", base.Add(time.Hour)),
		project("c", "owner", "active", base.Add(2*time.Hour)),
		project("x", "intruder", "active", base.Add(3*time.Hour)),
	} {
		if err := repo.Insert(ctx, p); err != nil {
			t.Fatalf("insert %d: %v", i, err)
		}
	}

	page, total, err := repo.FindAll(ctx, bson.M{"userId": "owner"}, 1, 2)
	if err != nil {
		t.Fatalf("FindAll: %v", err)
	}
	if total != 3 || len(page) != 2 || page[0].ID != "c" || page[1].ID != "b" {
		t.Fatalf("expected newest-first page [c b] of 3, got %d %v", total, ids(page))
	}
	if page[0].RoomData != nil {
		t.Fatal("the list must not load scenes")
	}

	active, total, err := repo.FindAll(ctx, bson.M{"userId": "owner", "status": "active"}, 1, 10)
	if err != nil || total != 2 || !slices.Equal(ids(active), []string{"c", "a"}) {
		t.Fatalf("expected active [c a], got %v (%v)", ids(active), err)
	}

	empty, total, err := repo.FindAll(ctx, bson.M{"userId": "ghost"}, 1, 10)
	if err != nil || total != 0 || empty == nil {
		t.Fatalf("an empty list must be [] not nil, got %v (%v)", empty, err)
	}

	if n, err := repo.Count(ctx, "owner"); err != nil || n != 3 {
		t.Fatalf("Count: expected 3, got %d (%v)", n, err)
	}
}

func ids(projects []models.Project) []string {
	out := make([]string, len(projects))
	for i, p := range projects {
		out[i] = p.ID
	}
	return out
}

func TestProjectRepoWritesAreOwnerScoped(t *testing.T) {
	ctx := requireDB(t, "projects")
	repo := NewProjectRepo(testDB)
	if err := repo.Insert(ctx, project("p1", "owner", "active", time.Now())); err != nil {
		t.Fatalf("insert: %v", err)
	}

	if ok, err := repo.Update(ctx, "p1", "intruder", bson.M{"name": "hijacked"}); err != nil || ok {
		t.Fatalf("a foreign update must match nothing, got %v (%v)", ok, err)
	}
	if ok, err := repo.Delete(ctx, "p1", "intruder"); err != nil || ok {
		t.Fatalf("a foreign delete must match nothing, got %v (%v)", ok, err)
	}
	if ok, err := repo.Update(ctx, "missing", "owner", bson.M{"name": "x"}); err != nil || ok {
		t.Fatalf("a missing project must report no match, got %v (%v)", ok, err)
	}

	if ok, err := repo.Update(ctx, "p1", "owner", bson.M{"name": "renamed"}); err != nil || !ok {
		t.Fatalf("owner update failed: %v (%v)", ok, err)
	}
	got, err := repo.FindByID(ctx, "p1")
	if err != nil || got.Name != "renamed" || got.RoomData == nil {
		t.Fatalf("expected the renamed project with its scene, got %+v (%v)", got, err)
	}

	if ok, err := repo.Delete(ctx, "p1", "owner"); err != nil || !ok {
		t.Fatalf("owner delete failed: %v (%v)", ok, err)
	}
	if got, err := repo.FindByID(ctx, "p1"); err != nil || got != nil {
		t.Fatalf("a deleted project must be gone, got %+v (%v)", got, err)
	}
}

// Номера выдаются атомарно: параллельное создание не даёт дублей, у каждого
// пользователя своя последовательность.
func TestProjectRepoNextNumberIsAtomicPerUser(t *testing.T) {
	ctx := requireDB(t, "counters")
	repo := NewProjectRepo(testDB)

	const callers = 20
	numbers := make(chan int, callers)
	var wg sync.WaitGroup
	for i := 0; i < callers; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			n, err := repo.NextNumber(ctx, "owner")
			if err != nil {
				t.Errorf("NextNumber: %v", err)
			}
			numbers <- n
		}()
	}
	wg.Wait()
	close(numbers)

	seen := map[int]bool{}
	for n := range numbers {
		if seen[n] || n < 1 || n > callers {
			t.Fatalf("duplicate or out-of-range number %d", n)
		}
		seen[n] = true
	}
	if n, err := repo.NextNumber(ctx, "other"); err != nil || n != 1 {
		t.Fatalf("another user starts from 1, got %d (%v)", n, err)
	}
}
