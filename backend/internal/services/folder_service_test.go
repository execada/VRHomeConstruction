package services

import (
	"context"
	"testing"

	"github.com/execada/VRHomeConstruction/backend/internal/models"
)

func strptr(s string) *string { return &s }

func TestBuildFolderTreeRoots(t *testing.T) {
	folders := []models.Folder{
		{ID: "a", Name: "A", ParentID: nil},
		{ID: "b", Name: "B", ParentID: strptr("")},
	}

	tree := buildFolderTree(folders)
	if len(tree) != 2 {
		t.Fatalf("expected 2 roots, got %d", len(tree))
	}
	for _, n := range tree {
		if len(n.Children) != 0 {
			t.Errorf("root %q should have no children", n.ID)
		}
	}
}

func TestBuildFolderTreeNestingMultiLevel(t *testing.T) {
	// Порядок намеренно "перемешан": родитель идёт после ребёнка/внука,
	// чтобы поймать баг с копированием узлов до присоединения потомков.
	folders := []models.Folder{
		{ID: "c", Name: "C", ParentID: strptr("b")},
		{ID: "a", Name: "A", ParentID: nil},
		{ID: "b", Name: "B", ParentID: strptr("a")},
	}

	tree := buildFolderTree(folders)
	if len(tree) != 1 {
		t.Fatalf("expected 1 root, got %d", len(tree))
	}
	root := tree[0]
	if root.ID != "a" {
		t.Fatalf("expected root A, got %q", root.ID)
	}
	if len(root.Children) != 1 || root.Children[0].ID != "b" {
		t.Fatalf("expected A -> B, got %+v", root.Children)
	}
	b := root.Children[0]
	if len(b.Children) != 1 || b.Children[0].ID != "c" {
		t.Fatalf("expected B -> C, got %+v", b.Children)
	}
}

func TestBuildFolderTreeOrphanBecomesRoot(t *testing.T) {
	folders := []models.Folder{
		{ID: "x", Name: "X", ParentID: strptr("nonexistent")},
	}
	tree := buildFolderTree(folders)
	if len(tree) != 1 || tree[0].ID != "x" {
		t.Fatalf("expected orphan to be treated as root, got %+v", tree)
	}
}

func TestBuildFolderTreeEmpty(t *testing.T) {
	tree := buildFolderTree(nil)
	if tree == nil {
		t.Fatal("expected non-nil empty slice for nil input")
	}
	if len(tree) != 0 {
		t.Fatalf("expected empty tree, got %d", len(tree))
	}
}

func TestFolderGetTreeScopedByUser(t *testing.T) {
	repo := newFakeFolderRepo()
	repo.byID["a"] = &models.Folder{ID: "a", Name: "A", UserID: "user-1"}
	repo.byID["b"] = &models.Folder{ID: "b", Name: "B", UserID: "user-2"}
	svc := NewFolderService(repo)

	tree, err := svc.GetTree(context.Background(), "user-1")
	if err != nil {
		t.Fatalf("GetTree failed: %v", err)
	}
	if len(tree) != 1 || tree[0].ID != "a" {
		t.Fatalf("expected only user-1's folder, got %+v", tree)
	}
}

func TestFolderOwnershipChecks(t *testing.T) {
	repo := newFakeFolderRepo()
	svc := NewFolderService(repo)
	ctx := context.Background()

	created, err := svc.Create(ctx, models.CreateFolderRequest{Name: "F"}, "owner")
	if err != nil {
		t.Fatalf("Create failed: %v", err)
	}

	if _, err := svc.GetByID(ctx, created.ID, "intruder"); err != ErrFolderForbidden {
		t.Fatalf("expected ErrFolderForbidden on GetByID, got %v", err)
	}
	if _, err := svc.Update(ctx, created.ID, "intruder", models.UpdateFolderRequest{Name: "F2"}); err != ErrFolderForbidden {
		t.Fatalf("expected ErrFolderForbidden on Update, got %v", err)
	}
	if err := svc.Delete(ctx, created.ID, "intruder"); err != ErrFolderForbidden {
		t.Fatalf("expected ErrFolderForbidden on Delete, got %v", err)
	}

	if err := svc.Delete(ctx, created.ID, "owner"); err != nil {
		t.Fatalf("owner should delete own folder, got %v", err)
	}
}

func TestFolderUpdatePreservesOwnerAndInitsSlices(t *testing.T) {
	repo := newFakeFolderRepo()
	svc := NewFolderService(repo)
	ctx := context.Background()

	created, _ := svc.Create(ctx, models.CreateFolderRequest{Name: "F"}, "owner")

	updated, err := svc.Update(ctx, created.ID, "owner", models.UpdateFolderRequest{
		Name:       "F renamed",
		ProjectIDs: []string{"p1"},
	})
	if err != nil {
		t.Fatalf("Update failed: %v", err)
	}
	if updated.UserID != "owner" {
		t.Errorf("expected owner preserved, got %q", updated.UserID)
	}
	if updated.LayoutIDs == nil || updated.ChildFolderIDs == nil {
		t.Error("expected nil id slices to be normalised to empty slices")
	}
	if len(updated.ProjectIDs) != 1 || updated.ProjectIDs[0] != "p1" {
		t.Errorf("expected projectIds [p1], got %v", updated.ProjectIDs)
	}
}
