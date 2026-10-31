package repositories

import (
	"slices"
	"testing"
	"time"

	"github.com/execada/VRHomeConstruction/backend/internal/models"
)

func TestFolderRepoScopesWritesAndCleansProjects(t *testing.T) {
	ctx := requireDB(t, "folders")
	repo := NewFolderRepo(testDB)
	base := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	for _, f := range []*models.Folder{
		{ID: "f2", Name: "Second", UserID: "owner", ProjectIDs: []string{"p1", "p2"}, CreatedAt: base.Add(time.Hour)},
		{ID: "f1", Name: "First", UserID: "owner", ProjectIDs: []string{"p1"}, CreatedAt: base},
		{ID: "fx", Name: "Foreign", UserID: "intruder", ProjectIDs: []string{"p1"}, CreatedAt: base},
	} {
		if err := repo.Insert(ctx, f); err != nil {
			t.Fatalf("insert %s: %v", f.ID, err)
		}
	}

	folders, err := repo.FindAll(ctx, "owner")
	if err != nil || len(folders) != 2 || folders[0].ID != "f1" || folders[1].ID != "f2" {
		t.Fatalf("expected owner's folders oldest first [f1 f2], got %+v (%v)", folders, err)
	}

	if err := repo.RemoveProject(ctx, "owner", "p1"); err != nil {
		t.Fatalf("RemoveProject: %v", err)
	}
	f2, _ := repo.FindByID(ctx, "f2")
	fx, _ := repo.FindByID(ctx, "fx")
	if !slices.Equal(f2.ProjectIDs, []string{"p2"}) || !slices.Equal(fx.ProjectIDs, []string{"p1"}) {
		t.Fatalf("only the owner's folders must lose the project, got %v / %v", f2.ProjectIDs, fx.ProjectIDs)
	}

	renamed := *f2
	renamed.Name = "Renamed"
	if ok, err := repo.Update(ctx, "f2", "intruder", &renamed); err != nil || ok {
		t.Fatalf("a foreign update must match nothing, got %v (%v)", ok, err)
	}
	if ok, err := repo.Update(ctx, "f2", "owner", &renamed); err != nil || !ok {
		t.Fatalf("owner update failed: %v (%v)", ok, err)
	}
	if ok, err := repo.Delete(ctx, "f2", "intruder"); err != nil || ok {
		t.Fatalf("a foreign delete must match nothing, got %v (%v)", ok, err)
	}
	if ok, err := repo.Delete(ctx, "f2", "owner"); err != nil || !ok {
		t.Fatalf("owner delete failed: %v (%v)", ok, err)
	}
	if got, err := repo.FindByID(ctx, "f2"); err != nil || got != nil {
		t.Fatalf("a deleted folder must be gone, got %+v (%v)", got, err)
	}
}

func TestLayoutRepoListsWithoutScenesAndScopesWrites(t *testing.T) {
	ctx := requireDB(t, "layouts")
	repo := NewLayoutRepo(testDB)
	base := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	for _, l := range []*models.Layout{
		{ID: "l1", Name: "Old", UserID: "owner", UpdatedAt: base, RoomData: models.RoomData{"v": 1.0}},
		{ID: "l2", Name: "New", UserID: "owner", UpdatedAt: base.Add(time.Hour), RoomData: models.RoomData{"v": 2.0}},
		{ID: "lx", Name: "Foreign", UserID: "intruder", UpdatedAt: base},
	} {
		if err := repo.Insert(ctx, l); err != nil {
			t.Fatalf("insert %s: %v", l.ID, err)
		}
	}

	layouts, err := repo.FindAll(ctx, "owner")
	if err != nil || len(layouts) != 2 || layouts[0].ID != "l2" || layouts[0].RoomData != nil {
		t.Fatalf("expected owner's layouts newest first without scenes, got %+v (%v)", layouts, err)
	}
	full, err := repo.FindByID(ctx, "l1")
	if err != nil || full.RoomData["v"] != 1.0 {
		t.Fatalf("FindByID must load the scene, got %+v (%v)", full, err)
	}

	changed := *full
	changed.Name = "Changed"
	if ok, err := repo.Update(ctx, "l1", "intruder", &changed); err != nil || ok {
		t.Fatalf("a foreign update must match nothing, got %v (%v)", ok, err)
	}
	if ok, err := repo.Update(ctx, "l1", "owner", &changed); err != nil || !ok {
		t.Fatalf("owner update failed: %v (%v)", ok, err)
	}
	if ok, err := repo.Delete(ctx, "l1", "intruder"); err != nil || ok {
		t.Fatalf("a foreign delete must match nothing, got %v (%v)", ok, err)
	}
	if ok, err := repo.Delete(ctx, "l1", "owner"); err != nil || !ok {
		t.Fatalf("owner delete failed: %v (%v)", ok, err)
	}
	if got, err := repo.FindByID(ctx, "missing"); err != nil || got != nil {
		t.Fatalf("a missing layout must be nil, got %+v (%v)", got, err)
	}
}
