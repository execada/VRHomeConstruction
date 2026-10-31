package services

import (
	"context"
	"errors"
	"reflect"
	"strings"
	"testing"
	"time"

	"github.com/execada/VRHomeConstruction/backend/internal/models"
)

func TestLayoutListScopedByUser(t *testing.T) {
	repo := newFakeLayoutRepo()
	svc := NewLayoutService(repo)
	ctx := context.Background()

	_, _ = svc.Create(ctx, models.CreateLayoutRequest{Name: "L1"}, "user-1")
	_, _ = svc.Create(ctx, models.CreateLayoutRequest{Name: "L2"}, "user-2")

	list, err := svc.List(ctx, "user-1")
	if err != nil {
		t.Fatalf("List failed: %v", err)
	}
	if len(list) != 1 || list[0].UserID != "user-1" {
		t.Fatalf("expected only user-1's layout, got %+v", list)
	}
}

func TestLayoutOwnershipChecks(t *testing.T) {
	repo := newFakeLayoutRepo()
	svc := NewLayoutService(repo)
	ctx := context.Background()

	created, err := svc.Create(ctx, models.CreateLayoutRequest{Name: "L"}, "owner")
	if err != nil {
		t.Fatalf("Create failed: %v", err)
	}

	if _, err := svc.GetByID(ctx, created.ID, "intruder"); err != ErrLayoutForbidden {
		t.Fatalf("expected ErrLayoutForbidden on GetByID, got %v", err)
	}
	if _, err := svc.Update(ctx, created.ID, "intruder", models.UpdateLayoutRequest{Name: "L2"}); err != ErrLayoutForbidden {
		t.Fatalf("expected ErrLayoutForbidden on Update, got %v", err)
	}
	if err := svc.Delete(ctx, created.ID, "intruder"); err != ErrLayoutForbidden {
		t.Fatalf("expected ErrLayoutForbidden on Delete, got %v", err)
	}

	if _, err := svc.GetByID(ctx, "missing", "owner"); err != ErrLayoutNotFound {
		t.Fatalf("expected ErrLayoutNotFound, got %v", err)
	}
	if _, err := svc.Update(ctx, "missing", "owner", models.UpdateLayoutRequest{Name: "L2"}); err != ErrLayoutNotFound {
		t.Fatalf("expected ErrLayoutNotFound on Update, got %v", err)
	}
	if err := svc.Delete(ctx, "missing", "owner"); err != ErrLayoutNotFound {
		t.Fatalf("expected ErrLayoutNotFound on Delete, got %v", err)
	}
	if err := svc.Delete(ctx, created.ID, "owner"); err != nil {
		t.Fatalf("owner should delete own layout, got %v", err)
	}
}

func TestLayoutCreateAsTemplate(t *testing.T) {
	repo := newFakeLayoutRepo()
	svc := NewLayoutService(repo)
	ctx := context.Background()

	created, err := svc.Create(ctx, models.CreateLayoutRequest{
		Name:        "  Студия  ",
		Description: strptr(" Шаблон студии "),
		RoomData:    validScene(),
		Thumbnail:   strptr(testThumbnail),
	}, "owner")
	if err != nil {
		t.Fatalf("Create failed: %v", err)
	}
	if created.Name != "Студия" || created.Description != "Шаблон студии" || created.Thumbnail != testThumbnail {
		t.Fatalf("unexpected layout %+v", created)
	}

	got, err := svc.GetByID(ctx, created.ID, "owner")
	if err != nil {
		t.Fatalf("GetByID failed: %v", err)
	}
	if _, ok := got.RoomData["materials"]; !ok {
		t.Fatal("GetByID must return the full scene document")
	}
}

func TestLayoutCreateWithoutOptionalFields(t *testing.T) {
	svc := NewLayoutService(newFakeLayoutRepo())

	created, err := svc.Create(context.Background(), models.CreateLayoutRequest{Name: "L"}, "owner")
	if err != nil {
		t.Fatalf("Create failed: %v", err)
	}
	if created.RoomData != nil || created.Description != "" || created.Thumbnail != "" {
		t.Fatalf("expected empty optional fields, got %+v", created)
	}
	if created.CreatedAt.IsZero() || !created.CreatedAt.Equal(created.UpdatedAt) {
		t.Fatal("expected fresh equal timestamps")
	}
}

func TestLayoutCreateValidation(t *testing.T) {
	cases := map[string]struct {
		req  models.CreateLayoutRequest
		kind error
	}{
		"blank name":       {models.CreateLayoutRequest{Name: " "}, ErrInvalidName},
		"long description": {models.CreateLayoutRequest{Name: "L", Description: strptr(strings.Repeat("d", maxDescriptionLen+1))}, ErrInvalidDescription},
		"bad roomData":     {models.CreateLayoutRequest{Name: "L", RoomData: []interface{}{1.0}}, ErrInvalidRoomData},
		"bad thumbnail":    {models.CreateLayoutRequest{Name: "L", Thumbnail: strptr("javascript:alert(1)")}, ErrInvalidThumbnail},
	}
	for name, tc := range cases {
		t.Run(name, func(t *testing.T) {
			repo := newFakeLayoutRepo()
			_, err := NewLayoutService(repo).Create(context.Background(), tc.req, "owner")
			assertValidationErr(t, err, tc.kind)
			if len(repo.byID) != 0 {
				t.Fatal("invalid layout must not be persisted")
			}
		})
	}
}

func TestLayoutUpdateKeepsAbsentFields(t *testing.T) {
	repo := newFakeLayoutRepo()
	svc := NewLayoutService(repo)
	ctx := context.Background()

	created, err := svc.Create(ctx, models.CreateLayoutRequest{
		Name: "L", Description: strptr("desc"), RoomData: validScene(), Thumbnail: strptr(testThumbnail),
	}, "owner")
	if err != nil {
		t.Fatalf("Create failed: %v", err)
	}
	created.CreatedAt = time.Now().Add(-time.Hour) // имитируем «старый» шаблон
	created.UpdatedAt = created.CreatedAt
	before := *created

	updated, err := svc.Update(ctx, created.ID, "owner", models.UpdateLayoutRequest{Name: " Новое имя "})
	if err != nil {
		t.Fatalf("Update failed: %v", err)
	}
	if updated.Name != "Новое имя" {
		t.Errorf("expected name to change, got %q", updated.Name)
	}
	if updated.Description != "desc" || updated.Thumbnail != testThumbnail || !reflect.DeepEqual(updated.RoomData, before.RoomData) {
		t.Fatalf("absent fields must keep existing values, got %+v", updated)
	}
	if !updated.CreatedAt.Equal(before.CreatedAt) || !updated.UpdatedAt.After(before.UpdatedAt) {
		t.Fatal("expected createdAt preserved and updatedAt moved forward")
	}
	if updated.UserID != "owner" || repo.updated == nil || repo.updated.Name != "Новое имя" {
		t.Fatal("expected the full layout to be persisted with the same owner")
	}
	if !reflect.DeepEqual(*created, before) {
		t.Fatal("Update must not mutate the layout returned by the repository")
	}
}

func TestLayoutUpdateReplacesProvidedFields(t *testing.T) {
	repo := newFakeLayoutRepo()
	svc := NewLayoutService(repo)
	ctx := context.Background()

	created, _ := svc.Create(ctx, models.CreateLayoutRequest{
		Name: "L", Description: strptr("desc"), RoomData: validScene(), Thumbnail: strptr(testThumbnail),
	}, "owner")

	scene := map[string]interface{}{"dimensions": map[string]interface{}{"width": 6.0, "height": 3.0, "depth": 6.0}}
	updated, err := svc.Update(ctx, created.ID, "owner", models.UpdateLayoutRequest{
		Name: "L", Description: strptr(""), RoomData: scene, Thumbnail: strptr(""),
	})
	if err != nil {
		t.Fatalf("Update failed: %v", err)
	}
	if updated.Description != "" || updated.Thumbnail != "" {
		t.Fatalf("explicit empty values must clear description/thumbnail, got %+v", updated)
	}
	if !reflect.DeepEqual(updated.RoomData, models.RoomData(scene)) {
		t.Fatalf("expected roomData to be replaced, got %#v", updated.RoomData)
	}
}

func TestLayoutUpdateValidation(t *testing.T) {
	cases := map[string]struct {
		req  models.UpdateLayoutRequest
		kind error
	}{
		"missing name":     {models.UpdateLayoutRequest{}, ErrInvalidName},
		"long description": {models.UpdateLayoutRequest{Name: "L", Description: strptr(strings.Repeat("d", maxDescriptionLen+1))}, ErrInvalidDescription},
		"bad roomData": {models.UpdateLayoutRequest{Name: "L", RoomData: map[string]interface{}{
			"furniture": items(maxFurnitureItems + 1),
		}}, ErrInvalidRoomData},
		"bad thumbnail": {models.UpdateLayoutRequest{Name: "L", Thumbnail: strptr("data:image/gif;base64,R0lG")}, ErrInvalidThumbnail},
	}
	for name, tc := range cases {
		t.Run(name, func(t *testing.T) {
			repo := newFakeLayoutRepo()
			svc := NewLayoutService(repo)
			created, _ := svc.Create(context.Background(), models.CreateLayoutRequest{Name: "L"}, "owner")
			_, err := svc.Update(context.Background(), created.ID, "owner", tc.req)
			assertValidationErr(t, err, tc.kind)
			if repo.updated != nil {
				t.Fatal("invalid update must not be persisted")
			}
		})
	}
}

func TestLayoutServicePropagatesRepositoryErrors(t *testing.T) {
	boom := errors.New("db down")
	ctx := context.Background()
	const id = "layout-1"

	cases := map[string]struct {
		inject func(*fakeLayoutRepo)
		call   func(*LayoutService) error
	}{
		"list": {func(r *fakeLayoutRepo) { r.findAllErr = boom }, func(s *LayoutService) error {
			_, err := s.List(ctx, "owner")
			return err
		}},
		"get": {func(r *fakeLayoutRepo) { r.findErr = boom }, func(s *LayoutService) error {
			_, err := s.GetByID(ctx, id, "owner")
			return err
		}},
		"create": {func(r *fakeLayoutRepo) { r.insertErr = boom }, func(s *LayoutService) error {
			_, err := s.Create(ctx, models.CreateLayoutRequest{Name: "L"}, "owner")
			return err
		}},
		"update find": {func(r *fakeLayoutRepo) { r.findErr = boom }, func(s *LayoutService) error {
			_, err := s.Update(ctx, id, "owner", models.UpdateLayoutRequest{Name: "L"})
			return err
		}},
		"update write": {func(r *fakeLayoutRepo) { r.updateErr = boom }, func(s *LayoutService) error {
			_, err := s.Update(ctx, id, "owner", models.UpdateLayoutRequest{Name: "L"})
			return err
		}},
		"delete find": {func(r *fakeLayoutRepo) { r.findErr = boom }, func(s *LayoutService) error {
			return s.Delete(ctx, id, "owner")
		}},
		"delete write": {func(r *fakeLayoutRepo) { r.deleteErr = boom }, func(s *LayoutService) error {
			return s.Delete(ctx, id, "owner")
		}},
	}
	for name, tc := range cases {
		t.Run(name, func(t *testing.T) {
			repo := newFakeLayoutRepo()
			repo.byID[id] = &models.Layout{ID: id, Name: "L", UserID: "owner"}
			tc.inject(repo)
			if err := tc.call(NewLayoutService(repo)); !errors.Is(err, boom) {
				t.Fatalf("expected the repository error to propagate, got %v", err)
			}
		})
	}
}
