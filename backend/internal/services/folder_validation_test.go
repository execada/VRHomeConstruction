package services

import (
	"context"
	"errors"
	"fmt"
	"slices"
	"strings"
	"testing"

	"github.com/execada/VRHomeConstruction/backend/internal/models"
)

// vanishingFolderRepo: папка нашлась, но к записи её уже удалили.
type vanishingFolderRepo struct{ *fakeFolderRepo }

func (vanishingFolderRepo) Update(context.Context, string, string, *models.Folder) (bool, error) {
	return false, nil
}

func (vanishingFolderRepo) Delete(context.Context, string, string) (bool, error) {
	return false, nil
}

// folderChain создаёт цепочку root ← mid ← leaf у владельца "owner" и папку чужого пользователя.
func folderChain() *fakeFolderRepo {
	repo := newFakeFolderRepo()
	root, mid := "root", "mid"
	repo.byID["root"] = &models.Folder{ID: "root", Name: "Root", UserID: "owner"}
	repo.byID["mid"] = &models.Folder{ID: "mid", Name: "Mid", UserID: "owner", ParentID: &root}
	repo.byID["leaf"] = &models.Folder{ID: "leaf", Name: "Leaf", UserID: "owner", ParentID: &mid}
	repo.byID["foreign"] = &models.Folder{ID: "foreign", Name: "Foreign", UserID: "intruder"}
	return repo
}

func strPtr(s string) *string { return &s }

func TestFolderParentValidation(t *testing.T) {
	cases := []struct {
		name    string
		id      string // "" — создание новой папки
		parent  *string
		wantErr string
		wantNil bool
	}{
		{name: "own parent on create", parent: strPtr("leaf")},
		{name: "blank parent is root", parent: strPtr("   "), wantNil: true},
		{name: "foreign parent", parent: strPtr("foreign"), wantErr: "parent folder not found"},
		{name: "missing parent", parent: strPtr("ghost"), wantErr: "parent folder not found"},
		{name: "malformed parent", parent: strPtr("../root"), wantErr: "invalid parentId"},
		{name: "self parent", id: "mid", parent: strPtr("mid"), wantErr: "folder cannot be its own parent"},
		{name: "direct cycle", id: "mid", parent: strPtr("leaf"), wantErr: "folder cannot be moved into its own subfolder"},
		{name: "deep cycle", id: "root", parent: strPtr("leaf"), wantErr: "folder cannot be moved into its own subfolder"},
		{name: "move up is fine", id: "leaf", parent: strPtr("root")},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			repo := folderChain()
			svc := NewFolderService(repo)
			ctx := context.Background()

			var got *models.Folder
			var err error
			if tc.id == "" {
				got, err = svc.Create(ctx, models.CreateFolderRequest{Name: "New", ParentID: tc.parent}, "owner")
			} else {
				got, err = svc.Update(ctx, tc.id, "owner", models.UpdateFolderRequest{Name: "Renamed", ParentID: tc.parent})
			}

			if tc.wantErr != "" {
				if !errors.Is(err, ErrInvalidFolder) || err.Error() != tc.wantErr {
					t.Fatalf("expected %q, got %v", tc.wantErr, err)
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if tc.wantNil != (got.ParentID == nil) {
				t.Fatalf("unexpected parent %v", got.ParentID)
			}
			if !tc.wantNil && *got.ParentID != strings.TrimSpace(*tc.parent) {
				t.Fatalf("expected parent %q, got %q", *tc.parent, *got.ParentID)
			}
		})
	}
}

func TestFolderMembersValidation(t *testing.T) {
	tooMany := make([]string, maxFolderItems+1)
	for i := range tooMany {
		tooMany[i] = fmt.Sprintf("p%d", i)
	}
	cases := []struct {
		name    string
		req     models.UpdateFolderRequest
		wantErr string
	}{
		{name: "malformed project id", req: models.UpdateFolderRequest{Name: "F", ProjectIDs: []string{"ok", "$where"}}, wantErr: "projectIds contains an invalid id"},
		{name: "malformed layout id", req: models.UpdateFolderRequest{Name: "F", LayoutIDs: []string{""}}, wantErr: "layoutIds contains an invalid id"},
		{name: "too many children", req: models.UpdateFolderRequest{Name: "F", ChildFolderIDs: tooMany}, wantErr: fmt.Sprintf("childFolderIds must contain at most %d items", maxFolderItems)},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			repo := folderChain()
			if _, err := NewFolderService(repo).Update(context.Background(), "root", "owner", tc.req); !errors.Is(err, ErrInvalidFolder) || err.Error() != tc.wantErr {
				t.Fatalf("expected %q, got %v", tc.wantErr, err)
			}
			if repo.updated != nil {
				t.Fatal("an invalid folder must not be written")
			}
		})
	}
}

func TestFolderMembersAreTrimmedAndDeduplicated(t *testing.T) {
	repo := folderChain()
	ids := []string{" p1 ", "p2", "p1"}

	got, err := NewFolderService(repo).Update(context.Background(), "root", "owner", models.UpdateFolderRequest{Name: "F", ProjectIDs: ids})
	if err != nil {
		t.Fatalf("Update failed: %v", err)
	}
	if !slices.Equal(got.ProjectIDs, []string{"p1", "p2"}) {
		t.Fatalf("expected [p1 p2], got %v", got.ProjectIDs)
	}
	if ids[0] != " p1 " {
		t.Fatal("the request slice must not be modified")
	}
}

func TestFolderMetaValidation(t *testing.T) {
	longDescription := strings.Repeat("д", maxDescriptionLen+1)
	svc := NewFolderService(folderChain())
	ctx := context.Background()

	if _, err := svc.Create(ctx, models.CreateFolderRequest{Name: strings.Repeat("я", maxFolderNameLen+1)}, "owner"); !errors.Is(err, ErrInvalidName) {
		t.Fatalf("expected ErrInvalidName, got %v", err)
	}
	if _, err := svc.Create(ctx, models.CreateFolderRequest{Name: "F", Description: &longDescription}, "owner"); !errors.Is(err, ErrInvalidDescription) {
		t.Fatalf("expected ErrInvalidDescription, got %v", err)
	}
	got, err := svc.Create(ctx, models.CreateFolderRequest{Name: "  Папка  ", Description: strPtr("  описание ")}, "owner")
	if err != nil {
		t.Fatalf("Create failed: %v", err)
	}
	if got.Name != "Папка" || got.Description == nil || *got.Description != "описание" {
		t.Fatalf("expected trimmed name/description, got %q / %v", got.Name, got.Description)
	}
}

func TestFolderWritesReportVanishedFolder(t *testing.T) {
	svc := NewFolderService(vanishingFolderRepo{folderChain()})
	ctx := context.Background()

	if _, err := svc.Update(ctx, "root", "owner", models.UpdateFolderRequest{Name: "F"}); err != ErrFolderNotFound {
		t.Fatalf("Update: expected ErrFolderNotFound, got %v", err)
	}
	if err := svc.Delete(ctx, "root", "owner"); err != ErrFolderNotFound {
		t.Fatalf("Delete: expected ErrFolderNotFound, got %v", err)
	}
}
