package services

import (
	"context"
	"errors"
	"math"
	"slices"
	"strings"
	"testing"

	"github.com/execada/VRHomeConstruction/backend/internal/models"
	"go.mongodb.org/mongo-driver/bson"
)

// vanishingProjectRepo имитирует гонку: проект нашёлся, но к моменту записи
// его уже удалили (репозиторий сообщает, что документ не найден).
type vanishingProjectRepo struct{ *fakeProjectRepo }

func (vanishingProjectRepo) Update(context.Context, string, string, bson.M) (bool, error) {
	return false, nil
}

func (vanishingProjectRepo) Delete(context.Context, string, string) (bool, error) {
	return false, nil
}

type failingFolderCleaner struct{ calls int }

func (c *failingFolderCleaner) RemoveProject(context.Context, string, string) error {
	c.calls++
	return errors.New("folders unavailable")
}

func TestProjectQuota(t *testing.T) {
	ctx := context.Background()
	calls := map[string]func(*ProjectService) error{
		"create": func(s *ProjectService) error {
			_, err := s.Create(ctx, models.CreateProjectRequest{Name: "A"}, "owner")
			return err
		},
		"duplicate": func(s *ProjectService) error {
			_, err := s.Duplicate(ctx, seededProjectID, "owner")
			return err
		},
	}
	for name, call := range calls {
		t.Run(name, func(t *testing.T) {
			repo := newFakeProjectRepo()
			seedProject(repo, "owner")
			svc := NewProjectService(repo)

			repo.count = maxProjectsPerUser
			if err := call(svc); !errors.Is(err, ErrProjectLimit) || !IsValidationError(err) {
				t.Fatalf("expected the quota validation error, got %v", err)
			}
			if len(repo.byID) != 1 {
				t.Fatal("nothing must be inserted over the quota")
			}

			repo.count = maxProjectsPerUser - 1
			if err := call(svc); err != nil {
				t.Fatalf("one below the quota must work, got %v", err)
			}

			boom := errors.New("db down")
			repo.countErr = boom
			if err := call(svc); !errors.Is(err, boom) || IsValidationError(err) {
				t.Fatalf("a failed count is an internal error, got %v", err)
			}
		})
	}
}

func TestProjectSaveRejectsInvalidMetadata(t *testing.T) {
	longTemplate := strings.Repeat("t", maxTemplateLen+1)
	base := func(mut func(*models.UpdateProjectRequest)) models.UpdateProjectRequest {
		req := models.UpdateProjectRequest{Name: "A", Status: "active", RoomData: validScene()}
		mut(&req)
		return req
	}
	cases := []struct {
		name string
		req  models.UpdateProjectRequest
		kind error
	}{
		{"unknown status", base(func(r *models.UpdateProjectRequest) { r.Status = "deleted" }), ErrInvalidStatus},
		{"template too long", base(func(r *models.UpdateProjectRequest) { r.Template = &longTemplate }), ErrInvalidTemplate},
		{"pose of two numbers", base(func(r *models.UpdateProjectRequest) { r.PlayerPosition = []float64{1, 2} }), ErrInvalidPose},
		{"NaN rotation", base(func(r *models.UpdateProjectRequest) { r.PlayerRotation = []float64{0, math.NaN(), 0} }), ErrInvalidPose},
		{"infinite position", base(func(r *models.UpdateProjectRequest) { r.PlayerPosition = []float64{math.Inf(1), 0, 0} }), ErrInvalidPose},
		{"position out of range", base(func(r *models.UpdateProjectRequest) { r.PlayerPosition = []float64{0, 0, maxPoseAbs + 1} }), ErrInvalidPose},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			repo := newFakeProjectRepo()
			seedProject(repo, "owner")
			_, err := NewProjectService(repo).Update(context.Background(), seededProjectID, "owner", tc.req)
			if !errors.Is(err, tc.kind) || !IsValidationError(err) {
				t.Fatalf("expected %v validation error, got %v", tc.kind, err)
			}
			if repo.updates != 0 {
				t.Fatal("an invalid request must not be written")
			}
		})
	}
}

func TestProjectCreateValidatesStatusAndTemplate(t *testing.T) {
	repo := newFakeProjectRepo()
	svc := NewProjectService(repo)
	ctx := context.Background()

	if _, err := svc.Create(ctx, models.CreateProjectRequest{Name: "A", Status: "published"}, "owner"); !errors.Is(err, ErrInvalidStatus) {
		t.Fatalf("expected ErrInvalidStatus, got %v", err)
	}
	tpl := "  studio "
	got, err := svc.Create(ctx, models.CreateProjectRequest{Name: "A", Status: "draft", Template: &tpl}, "owner")
	if err != nil {
		t.Fatalf("Create failed: %v", err)
	}
	if got.Status != "draft" || got.Template == nil || *got.Template != "studio" {
		t.Fatalf("expected draft status and trimmed template, got %q / %v", got.Status, got.Template)
	}
}

func TestProjectSaveClonesPose(t *testing.T) {
	repo := newFakeProjectRepo()
	seedProject(repo, "owner")
	pos := []float64{1, 1.6, 2}

	got, err := NewProjectService(repo).Update(context.Background(), seededProjectID, "owner", models.UpdateProjectRequest{
		Name: "A", Status: "active", RoomData: validScene(), PlayerPosition: pos,
	})
	if err != nil {
		t.Fatalf("Update failed: %v", err)
	}
	pos[0] = 99
	if got.PlayerPosition[0] != 1 || repo.byID[seededProjectID].PlayerPosition[0] != 1 {
		t.Fatal("the stored pose must not alias the request slice")
	}
}

func TestProjectDeleteRemovesItFromFolders(t *testing.T) {
	repo := newFakeProjectRepo()
	seedProject(repo, "owner")
	folders := newFakeFolderRepo()
	folders.byID["f1"] = &models.Folder{ID: "f1", UserID: "owner", ProjectIDs: []string{seededProjectID, "other"}}
	folders.byID["f2"] = &models.Folder{ID: "f2", UserID: "intruder", ProjectIDs: []string{seededProjectID}}

	svc := NewProjectService(repo).WithFolderCleanup(folders)
	if err := svc.Delete(context.Background(), seededProjectID, "owner"); err != nil {
		t.Fatalf("Delete failed: %v", err)
	}
	if got := folders.byID["f1"].ProjectIDs; !slices.Equal(got, []string{"other"}) {
		t.Fatalf("expected the project to leave the owner's folder, got %v", got)
	}
	if len(folders.byID["f2"].ProjectIDs) != 1 {
		t.Fatal("other users' folders must stay untouched")
	}
}

func TestProjectDeleteToleratesFolderCleanupFailure(t *testing.T) {
	repo := newFakeProjectRepo()
	seedProject(repo, "owner")
	cleaner := &failingFolderCleaner{}

	if err := NewProjectService(repo).WithFolderCleanup(cleaner).Delete(context.Background(), seededProjectID, "owner"); err != nil {
		t.Fatalf("a failed cleanup must not fail the deletion, got %v", err)
	}
	if cleaner.calls != 1 || len(repo.byID) != 0 {
		t.Fatal("the project must be deleted and the cleanup attempted once")
	}
}

func TestProjectWritesReportVanishedDocument(t *testing.T) {
	inner := newFakeProjectRepo()
	seedProject(inner, "owner")
	svc := NewProjectService(vanishingProjectRepo{inner})
	ctx := context.Background()

	if _, err := svc.Update(ctx, seededProjectID, "owner", models.UpdateProjectRequest{
		Name: "A", Status: "active", RoomData: validScene(),
	}); err != ErrProjectNotFound {
		t.Fatalf("Update: expected ErrProjectNotFound, got %v", err)
	}
	if err := svc.Delete(ctx, seededProjectID, "owner"); err != ErrProjectNotFound {
		t.Fatalf("Delete: expected ErrProjectNotFound, got %v", err)
	}
}
