package services

import (
	"context"
	"errors"
	"math"
	"reflect"
	"sort"
	"strings"
	"testing"
	"time"
	"unicode/utf8"

	"github.com/execada/VRHomeConstruction/backend/internal/models"
	"go.mongodb.org/mongo-driver/bson"
)

const seededProjectID = "proj-1"

// seedProject кладёт в фейк проект со всеми заполненными полями.
func seedProject(repo *fakeProjectRepo, owner string) *models.Project {
	number := 1
	past := time.Now().Add(-time.Hour)
	p := &models.Project{
		ID:          seededProjectID,
		Name:        "Old",
		Description: "старое описание",
		Tags:        []string{"x"},
		Thumbnail:   testThumbnail,
		Number:      &number,
		Status:      "active",
		UserID:      owner,
		RoomData:    validScene(),
		CreatedAt:   past,
		UpdatedAt:   past,
	}
	repo.byID[p.ID] = p
	return p
}

func sortedKeys(m bson.M) []string {
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	return keys
}

func assertKeys(t *testing.T, set bson.M, want ...string) {
	t.Helper()
	sort.Strings(want)
	if got := sortedKeys(set); !reflect.DeepEqual(got, want) {
		t.Fatalf("expected $set keys %v, got %v", want, got)
	}
}

func TestProjectCreateAssignsSequentialNumber(t *testing.T) {
	repo := newFakeProjectRepo()
	svc := NewProjectService(repo)
	ctx := context.Background()

	p1, err := svc.Create(ctx, models.CreateProjectRequest{Name: "A"}, "user-1")
	if err != nil {
		t.Fatalf("Create 1 failed: %v", err)
	}
	if p1.Number == nil || *p1.Number != 1 {
		t.Fatalf("expected first project number 1, got %v", p1.Number)
	}

	p2, err := svc.Create(ctx, models.CreateProjectRequest{Name: "B"}, "user-1")
	if err != nil {
		t.Fatalf("Create 2 failed: %v", err)
	}
	if p2.Number == nil || *p2.Number != 2 {
		t.Fatalf("expected second project number 2, got %v", p2.Number)
	}

	// Номера независимы между пользователями.
	pOther, err := svc.Create(ctx, models.CreateProjectRequest{Name: "C"}, "user-2")
	if err != nil {
		t.Fatalf("Create other failed: %v", err)
	}
	if pOther.Number == nil || *pOther.Number != 1 {
		t.Fatalf("expected other user's first project number 1, got %v", pOther.Number)
	}
}

func TestProjectCreateDefaults(t *testing.T) {
	repo := newFakeProjectRepo()
	svc := NewProjectService(repo)

	p, err := svc.Create(context.Background(), models.CreateProjectRequest{Name: "A", Status: "   "}, "user-1")
	if err != nil {
		t.Fatalf("Create failed: %v", err)
	}
	if p.Status != "draft" {
		t.Errorf("expected default status draft, got %q", p.Status)
	}
	if !reflect.DeepEqual(p.RoomData, defaultRoomData()) {
		t.Errorf("expected the default room, got %#v", p.RoomData)
	}
	if p.Tags == nil || len(p.Tags) != 0 {
		t.Errorf("expected tags to be an empty non-nil slice, got %#v", p.Tags)
	}
	if p.Description != "" || p.Thumbnail != "" || p.Favorite {
		t.Errorf("unexpected metadata defaults: %+v", p)
	}
	if p.CreatedAt.IsZero() || !p.CreatedAt.Equal(p.UpdatedAt) {
		t.Errorf("expected fresh equal timestamps, got %v / %v", p.CreatedAt, p.UpdatedAt)
	}
}

func TestProjectCreateWithRoomDataAndMetadata(t *testing.T) {
	repo := newFakeProjectRepo()
	svc := NewProjectService(repo)

	p, err := svc.Create(context.Background(), models.CreateProjectRequest{
		Name:        "  Гостиная  ",
		Status:      " active ",
		RoomData:    validScene(),
		Description: " Светлая комната ",
		Tags:        []string{" лофт ", "Лофт", "свет"},
	}, "user-1")
	if err != nil {
		t.Fatalf("Create failed: %v", err)
	}
	if p.Name != "Гостиная" || p.Status != "active" || p.Description != "Светлая комната" {
		t.Errorf("expected normalised fields, got name=%q status=%q description=%q", p.Name, p.Status, p.Description)
	}
	if !reflect.DeepEqual(p.Tags, []string{"лофт", "свет"}) {
		t.Errorf("unexpected tags %#v", p.Tags)
	}
	if _, ok := p.RoomData["materials"]; !ok {
		t.Error("extra roomData fields (materials) must be stored, not dropped")
	}
	if repo.byID[p.ID] == nil {
		t.Error("expected the project to be persisted")
	}
}

func TestProjectCreateValidation(t *testing.T) {
	cases := map[string]struct {
		req  models.CreateProjectRequest
		kind error
	}{
		"blank name":       {models.CreateProjectRequest{Name: "   "}, ErrInvalidName},
		"long name":        {models.CreateProjectRequest{Name: strings.Repeat("n", maxProjectNameLen+1)}, ErrInvalidName},
		"long status":      {models.CreateProjectRequest{Name: "A", Status: strings.Repeat("s", maxStatusLen+1)}, ErrInvalidStatus},
		"long description": {models.CreateProjectRequest{Name: "A", Description: strings.Repeat("d", maxDescriptionLen+1)}, ErrInvalidDescription},
		"bad tags":         {models.CreateProjectRequest{Name: "A", Tags: []string{""}}, ErrInvalidTags},
		"roomData array":   {models.CreateProjectRequest{Name: "A", RoomData: []interface{}{}}, ErrInvalidRoomData},
		"roomData dims": {models.CreateProjectRequest{Name: "A", RoomData: map[string]interface{}{
			"dimensions": map[string]interface{}{"width": 4.0, "height": 30.0, "depth": 4.0},
		}}, ErrInvalidRoomData},
	}
	for name, tc := range cases {
		t.Run(name, func(t *testing.T) {
			repo := newFakeProjectRepo()
			svc := NewProjectService(repo)
			_, err := svc.Create(context.Background(), tc.req, "user-1")
			assertValidationErr(t, err, tc.kind)
			if len(repo.byID) != 0 || repo.numbersIssued != 0 {
				t.Fatal("invalid input must not persist anything nor consume a project number")
			}
		})
	}
}

func TestProjectGetByIDOwnership(t *testing.T) {
	repo := newFakeProjectRepo()
	svc := NewProjectService(repo)
	ctx := context.Background()

	owned, _ := svc.Create(ctx, models.CreateProjectRequest{Name: "A"}, "owner")

	got, err := svc.GetByID(ctx, owned.ID, "owner")
	if err != nil {
		t.Fatalf("owner should access own project, got %v", err)
	}
	if got.RoomData == nil {
		t.Fatal("GetByID must return the full project including roomData")
	}

	if _, err := svc.GetByID(ctx, owned.ID, "intruder"); err != ErrProjectForbidden {
		t.Fatalf("expected ErrProjectForbidden for other user, got %v", err)
	}

	if _, err := svc.GetByID(ctx, "missing", "owner"); err != ErrProjectNotFound {
		t.Fatalf("expected ErrProjectNotFound for missing id, got %v", err)
	}
}

func TestProjectUpdatePreservesNumberWhenOmitted(t *testing.T) {
	repo := newFakeProjectRepo()
	svc := NewProjectService(repo)
	ctx := context.Background()

	created, _ := svc.Create(ctx, models.CreateProjectRequest{Name: "A"}, "owner")
	if created.Number == nil {
		t.Fatal("precondition: created project should have a number")
	}
	originalNumber := *created.Number

	// Автосейв редактора не передаёт number/template.
	updated, err := svc.Update(ctx, created.ID, "owner", models.UpdateProjectRequest{
		Name:     "A renamed",
		Status:   "active",
		RoomData: models.RoomData{},
	})
	if err != nil {
		t.Fatalf("Update failed: %v", err)
	}
	if updated.Number == nil || *updated.Number != originalNumber {
		t.Fatalf("expected number %d preserved, got %v", originalNumber, updated.Number)
	}
	if updated.Name != "A renamed" {
		t.Errorf("expected name to be updated, got %q", updated.Name)
	}
}

// Номер проекта выдаётся сервером и клиентом не меняется; шаблон — меняется.
func TestProjectUpdateOverridesTemplateButNeverNumber(t *testing.T) {
	repo := newFakeProjectRepo()
	svc := NewProjectService(repo)
	src := seedProject(repo, "owner")
	originalNumber := *src.Number

	tpl := " modern "
	got, err := svc.Update(context.Background(), seededProjectID, "owner", models.UpdateProjectRequest{
		Name: "A", Status: "active", RoomData: validScene(), Template: &tpl,
		PlayerRotation: []float64{0, 1.57, 0},
	})
	if err != nil {
		t.Fatalf("Update failed: %v", err)
	}
	if got.Template == nil || *got.Template != "modern" {
		t.Fatalf("expected trimmed template override, got %v", got.Template)
	}
	if got.Number == nil || *got.Number != originalNumber {
		t.Fatalf("number must stay %d, got %v", originalNumber, got.Number)
	}
	assertKeys(t, repo.lastUpdate, "name", "status", "roomData", "updatedAt", "template", "playerRotation")
}

func TestProjectUpdateSavesSceneAndKeepsMetadata(t *testing.T) {
	repo := newFakeProjectRepo()
	svc := NewProjectService(repo)
	src := seedProject(repo, "owner")
	before := *src

	got, err := svc.Update(context.Background(), src.ID, "owner", models.UpdateProjectRequest{
		Name:           " Новое имя ",
		Status:         "archived",
		RoomData:       validScene(),
		PlayerPosition: []float64{1, 1.6, 2},
	})
	if err != nil {
		t.Fatalf("Update failed: %v", err)
	}
	if got.Name != "Новое имя" || got.Status != "archived" {
		t.Errorf("expected name/status to be saved, got %q / %q", got.Name, got.Status)
	}
	if _, ok := got.RoomData["materials"]; !ok {
		t.Error("full scene document must be saved, including materials")
	}
	if got.Description != before.Description || !reflect.DeepEqual(got.Tags, before.Tags) ||
		got.Favorite != before.Favorite || got.Thumbnail != before.Thumbnail {
		t.Errorf("PUT must not touch description/tags/favorite/thumbnail, got %+v", got)
	}
	if !reflect.DeepEqual(got.PlayerPosition, []float64{1, 1.6, 2}) {
		t.Errorf("expected player position to be saved, got %v", got.PlayerPosition)
	}
	if !got.UpdatedAt.After(before.UpdatedAt) {
		t.Error("expected updatedAt to move forward")
	}
	assertKeys(t, repo.lastUpdate, "name", "status", "roomData", "updatedAt", "playerPosition")
	if !reflect.DeepEqual(*src, before) {
		t.Fatal("Update must not mutate the project returned by the repository")
	}
}

func TestProjectUpdateThumbnailSemantics(t *testing.T) {
	repo := newFakeProjectRepo()
	svc := NewProjectService(repo)
	ctx := context.Background()
	seedProject(repo, "owner")

	put := func(thumb *string) (*models.Project, error) {
		return svc.Update(ctx, seededProjectID, "owner", models.UpdateProjectRequest{
			Name: "A", Status: "active", RoomData: validScene(), Thumbnail: thumb,
		})
	}

	got, err := put(nil)
	if err != nil {
		t.Fatalf("Update without thumbnail failed: %v", err)
	}
	if got.Thumbnail != testThumbnail || repo.byID[seededProjectID].Thumbnail != testThumbnail {
		t.Fatal("absent thumbnail must keep the existing one")
	}
	if _, touched := repo.lastUpdate["thumbnail"]; touched {
		t.Fatal("absent thumbnail must not be written")
	}

	png := "data:image/png;base64,iVBORw0KGgo="
	if got, err = put(&png); err != nil || got.Thumbnail != png || repo.byID[seededProjectID].Thumbnail != png {
		t.Fatalf("expected thumbnail to be replaced, got %q (%v)", got.Thumbnail, err)
	}

	empty := ""
	if got, err = put(&empty); err != nil || got.Thumbnail != "" || repo.byID[seededProjectID].Thumbnail != "" {
		t.Fatalf("expected empty thumbnail to clear it, got %q (%v)", got.Thumbnail, err)
	}

	bad := "data:image/gif;base64,R0lGOD"
	_, err = put(&bad)
	assertValidationErr(t, err, ErrInvalidThumbnail)
}

func TestProjectUpdateValidation(t *testing.T) {
	cases := map[string]struct {
		req  models.UpdateProjectRequest
		kind error
	}{
		"missing roomData": {models.UpdateProjectRequest{Name: "A", Status: "active"}, ErrInvalidRoomData},
		"roomData string":  {models.UpdateProjectRequest{Name: "A", Status: "active", RoomData: "room"}, ErrInvalidRoomData},
		"roomData dims": {models.UpdateProjectRequest{Name: "A", Status: "active", RoomData: map[string]interface{}{
			"dimensions": map[string]interface{}{"width": 100.0, "height": 3.0, "depth": 4.0},
		}}, ErrInvalidRoomData},
		"blank name":     {models.UpdateProjectRequest{Name: " ", Status: "active", RoomData: validScene()}, ErrInvalidName},
		"missing status": {models.UpdateProjectRequest{Name: "A", RoomData: validScene()}, ErrInvalidStatus},
	}
	for name, tc := range cases {
		t.Run(name, func(t *testing.T) {
			repo := newFakeProjectRepo()
			svc := NewProjectService(repo)
			seedProject(repo, "owner")
			_, err := svc.Update(context.Background(), seededProjectID, "owner", tc.req)
			assertValidationErr(t, err, tc.kind)
			if repo.updates != 0 {
				t.Fatal("invalid input must not be written")
			}
		})
	}
}

func TestProjectUpdateAndDeleteForbidden(t *testing.T) {
	repo := newFakeProjectRepo()
	svc := NewProjectService(repo)
	ctx := context.Background()

	created, _ := svc.Create(ctx, models.CreateProjectRequest{Name: "A"}, "owner")

	_, err := svc.Update(ctx, created.ID, "intruder", models.UpdateProjectRequest{
		Name: "x", Status: "active", RoomData: models.RoomData{},
	})
	if err != ErrProjectForbidden {
		t.Fatalf("expected ErrProjectForbidden on update, got %v", err)
	}

	if _, err := svc.Update(ctx, "missing", "owner", models.UpdateProjectRequest{
		Name: "x", Status: "active", RoomData: models.RoomData{},
	}); err != ErrProjectNotFound {
		t.Fatalf("expected ErrProjectNotFound on update, got %v", err)
	}

	if err := svc.Delete(ctx, created.ID, "intruder"); err != ErrProjectForbidden {
		t.Fatalf("expected ErrProjectForbidden on delete, got %v", err)
	}
	if err := svc.Delete(ctx, "missing", "owner"); err != ErrProjectNotFound {
		t.Fatalf("expected ErrProjectNotFound on delete, got %v", err)
	}

	if err := svc.Delete(ctx, created.ID, "owner"); err != nil {
		t.Fatalf("owner should delete own project, got %v", err)
	}
	if repo.byID[created.ID] != nil {
		t.Fatal("expected the project to be deleted")
	}
}

func TestProjectListFiltersByUser(t *testing.T) {
	repo := newFakeProjectRepo()
	svc := NewProjectService(repo)
	ctx := context.Background()

	_, _ = svc.Create(ctx, models.CreateProjectRequest{Name: "A"}, "user-1")
	_, _ = svc.Create(ctx, models.CreateProjectRequest{Name: "B", Status: "active"}, "user-1")
	_, _ = svc.Create(ctx, models.CreateProjectRequest{Name: "C"}, "user-2")

	list, total, err := svc.List(ctx, "user-1", 1, 20, "")
	if err != nil {
		t.Fatalf("List failed: %v", err)
	}
	if total != 2 || len(list) != 2 {
		t.Fatalf("expected 2 projects for user-1, got total=%d len=%d", total, len(list))
	}
	for _, p := range list {
		if p.UserID != "user-1" {
			t.Errorf("List returned project of another user: %q", p.UserID)
		}
	}

	active, total, err := svc.List(ctx, "user-1", 1, 20, "active")
	if err != nil || total != 1 || len(active) != 1 || active[0].Name != "B" {
		t.Fatalf("expected status filter to return only B, got %+v (total=%d, err=%v)", active, total, err)
	}
}

func TestProjectListClampsPagination(t *testing.T) {
	repo := newFakeProjectRepo()
	svc := NewProjectService(repo)

	if _, _, err := svc.List(context.Background(), "user-1", 0, 1000, ""); err != nil {
		t.Fatalf("List failed: %v", err)
	}
	if repo.lastPage != 1 || repo.lastLimit != maxPageLimit {
		t.Fatalf("expected repository to receive page=1 limit=%d, got page=%d limit=%d",
			maxPageLimit, repo.lastPage, repo.lastLimit)
	}
}

func TestProjectPatchOnlyProvidedFields(t *testing.T) {
	repo := newFakeProjectRepo()
	svc := NewProjectService(repo)
	src := seedProject(repo, "owner")
	before := *src

	fav := true
	got, err := svc.Patch(context.Background(), src.ID, "owner", models.PatchProjectRequest{Favorite: &fav})
	if err != nil {
		t.Fatalf("Patch failed: %v", err)
	}
	assertKeys(t, repo.lastUpdate, "favorite", "updatedAt")

	if !got.Favorite || !repo.byID[src.ID].Favorite {
		t.Fatal("expected favorite to be set")
	}
	if got.Name != before.Name || got.Description != before.Description || got.Status != before.Status ||
		got.Thumbnail != before.Thumbnail || !reflect.DeepEqual(got.Tags, before.Tags) ||
		!reflect.DeepEqual(got.RoomData, before.RoomData) {
		t.Fatalf("fields that were not provided must stay unchanged, got %+v", got)
	}
	if !got.UpdatedAt.After(before.UpdatedAt) {
		t.Error("expected updatedAt to move forward")
	}
	if !reflect.DeepEqual(*src, before) {
		t.Fatal("Patch must not mutate the project returned by the repository")
	}
}

func TestProjectPatchAllFields(t *testing.T) {
	repo := newFakeProjectRepo()
	svc := NewProjectService(repo)
	seedProject(repo, "owner")

	name, desc, status, thumb := "  Новое  ", " описание ", " archived ", ""
	tags := []string{"a", "A", " b "}
	fav := true
	got, err := svc.Patch(context.Background(), seededProjectID, "owner", models.PatchProjectRequest{
		Name: &name, Description: &desc, Tags: &tags, Favorite: &fav, Thumbnail: &thumb, Status: &status,
	})
	if err != nil {
		t.Fatalf("Patch failed: %v", err)
	}
	if got.Name != "Новое" || got.Description != "описание" || got.Status != "archived" ||
		got.Thumbnail != "" || !got.Favorite || !reflect.DeepEqual(got.Tags, []string{"a", "b"}) {
		t.Fatalf("unexpected patched project %+v", got)
	}
	assertKeys(t, repo.lastUpdate, "name", "description", "tags", "favorite", "thumbnail", "status", "updatedAt")
	if stored := repo.byID[seededProjectID]; stored.Name != "Новое" || !reflect.DeepEqual(stored.Tags, []string{"a", "b"}) {
		t.Fatalf("expected changes to be persisted, got %+v", stored)
	}
}

func TestProjectPatchClearsTags(t *testing.T) {
	repo := newFakeProjectRepo()
	svc := NewProjectService(repo)
	seedProject(repo, "owner")

	empty := []string{}
	got, err := svc.Patch(context.Background(), seededProjectID, "owner", models.PatchProjectRequest{Tags: &empty})
	if err != nil {
		t.Fatalf("Patch failed: %v", err)
	}
	if got.Tags == nil || len(got.Tags) != 0 {
		t.Fatalf("expected tags to be cleared to [], got %#v", got.Tags)
	}
	if written, ok := repo.lastUpdate["tags"].([]string); !ok || written == nil || len(written) != 0 {
		t.Fatalf("expected [] to be written, got %#v", repo.lastUpdate["tags"])
	}
}

func TestProjectPatchEmptyIsNoop(t *testing.T) {
	repo := newFakeProjectRepo()
	svc := NewProjectService(repo)
	src := seedProject(repo, "owner")

	got, err := svc.Patch(context.Background(), src.ID, "owner", models.PatchProjectRequest{})
	if err != nil {
		t.Fatalf("empty Patch failed: %v", err)
	}
	if repo.updates != 0 {
		t.Fatal("empty patch must not write anything")
	}
	if !got.UpdatedAt.Equal(src.UpdatedAt) || got.Name != src.Name {
		t.Fatalf("empty patch must return the project unchanged, got %+v", got)
	}
}

func TestProjectPatchValidation(t *testing.T) {
	blank := "  "
	longDesc := strings.Repeat("d", maxDescriptionLen+1)
	tooMany := []string{"1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11"}
	badThumb := "data:text/html;base64,PHNjcmlwdD4="
	cases := map[string]struct {
		req  models.PatchProjectRequest
		kind error
	}{
		"blank name":       {models.PatchProjectRequest{Name: &blank}, ErrInvalidName},
		"long description": {models.PatchProjectRequest{Description: &longDesc}, ErrInvalidDescription},
		"too many tags":    {models.PatchProjectRequest{Tags: &tooMany}, ErrInvalidTags},
		"bad thumbnail":    {models.PatchProjectRequest{Thumbnail: &badThumb}, ErrInvalidThumbnail},
		"blank status":     {models.PatchProjectRequest{Status: &blank}, ErrInvalidStatus},
	}
	for name, tc := range cases {
		t.Run(name, func(t *testing.T) {
			repo := newFakeProjectRepo()
			svc := NewProjectService(repo)
			seedProject(repo, "owner")
			_, err := svc.Patch(context.Background(), seededProjectID, "owner", tc.req)
			assertValidationErr(t, err, tc.kind)
			if repo.updates != 0 {
				t.Fatal("invalid patch must not be written")
			}
		})
	}
}

func TestProjectPatchOwnership(t *testing.T) {
	repo := newFakeProjectRepo()
	svc := NewProjectService(repo)
	seedProject(repo, "owner")
	fav := true

	if _, err := svc.Patch(context.Background(), seededProjectID, "intruder", models.PatchProjectRequest{Favorite: &fav}); err != ErrProjectForbidden {
		t.Fatalf("expected ErrProjectForbidden, got %v", err)
	}
	if _, err := svc.Patch(context.Background(), "missing", "owner", models.PatchProjectRequest{Favorite: &fav}); err != ErrProjectNotFound {
		t.Fatalf("expected ErrProjectNotFound, got %v", err)
	}
	if repo.updates != 0 {
		t.Fatal("foreign/missing project must not be written")
	}
}

func TestProjectDuplicateCopiesProject(t *testing.T) {
	repo := newFakeProjectRepo()
	svc := NewProjectService(repo)
	ctx := context.Background()

	tpl := "modern"
	src, err := svc.Create(ctx, models.CreateProjectRequest{
		Name: "Гостиная", Status: "active", RoomData: validScene(), Description: "desc", Tags: []string{"лофт"},
		Template: &tpl,
	}, "owner")
	if err != nil {
		t.Fatalf("Create failed: %v", err)
	}
	fav, thumb := true, testThumbnail
	if _, err := svc.Patch(ctx, src.ID, "owner", models.PatchProjectRequest{Favorite: &fav, Thumbnail: &thumb}); err != nil {
		t.Fatalf("Patch failed: %v", err)
	}
	stored := *repo.byID[src.ID]

	start := time.Now()
	dup, err := svc.Duplicate(ctx, src.ID, "owner")
	if err != nil {
		t.Fatalf("Duplicate failed: %v", err)
	}

	if dup.ID == "" || dup.ID == src.ID || repo.byID[dup.ID] == nil {
		t.Fatalf("expected a new persisted project, got id %q", dup.ID)
	}
	if dup.Name != "Гостиная (копия)" {
		t.Errorf("unexpected copy name %q", dup.Name)
	}
	if dup.Number == nil || *dup.Number != 2 {
		t.Errorf("expected next sequential number 2, got %v", dup.Number)
	}
	if dup.Favorite {
		t.Error("copy must not be favorite")
	}
	if dup.UserID != "owner" || dup.Status != "active" || dup.Description != "desc" ||
		dup.Thumbnail != testThumbnail || !reflect.DeepEqual(dup.Tags, []string{"лофт"}) {
		t.Errorf("expected metadata to be copied, got %+v", dup)
	}
	if dup.Template == nil || *dup.Template != "modern" || dup.Template == stored.Template {
		t.Errorf("expected template to be copied into a new pointer, got %v", dup.Template)
	}
	if dup.CreatedAt.Before(start) || dup.UpdatedAt.Before(start) {
		t.Error("copy must get fresh timestamps")
	}
	if !reflect.DeepEqual(dup.RoomData, stored.RoomData) {
		t.Fatalf("expected identical roomData, got %#v", dup.RoomData)
	}

	// Копия независима от оригинала (глубокое копирование).
	dup.RoomData["colors"].(map[string]interface{})["walls"] = "#000000"
	dup.Tags[0] = "changed"
	if stored.RoomData["colors"].(map[string]interface{})["walls"] != "#c0b0a0" || stored.Tags[0] != "лофт" {
		t.Fatal("duplicate must not share roomData/tags with the original")
	}
}

func TestProjectDuplicateTruncatesLongName(t *testing.T) {
	repo := newFakeProjectRepo()
	svc := NewProjectService(repo)
	src := seedProject(repo, "owner")
	repo.byID[src.ID] = &models.Project{ID: src.ID, UserID: "owner", Name: strings.Repeat("д", maxProjectNameLen), Status: "draft"}

	dup, err := svc.Duplicate(context.Background(), src.ID, "owner")
	if err != nil {
		t.Fatalf("Duplicate failed: %v", err)
	}
	if utf8.RuneCountInString(dup.Name) != maxProjectNameLen || !strings.HasSuffix(dup.Name, copyNameSuffix) {
		t.Fatalf("expected a %d-rune name ending with the copy suffix, got %q", maxProjectNameLen, dup.Name)
	}
	if dup.RoomData != nil {
		t.Fatalf("project without roomData should be copied without it, got %#v", dup.RoomData)
	}
	if dup.Tags == nil {
		t.Fatal("copy tags must be a non-nil slice")
	}
}

func TestProjectDuplicateOwnership(t *testing.T) {
	repo := newFakeProjectRepo()
	svc := NewProjectService(repo)
	seedProject(repo, "owner")

	if _, err := svc.Duplicate(context.Background(), seededProjectID, "intruder"); err != ErrProjectForbidden {
		t.Fatalf("expected ErrProjectForbidden, got %v", err)
	}
	if _, err := svc.Duplicate(context.Background(), "missing", "owner"); err != ErrProjectNotFound {
		t.Fatalf("expected ErrProjectNotFound, got %v", err)
	}
	if len(repo.byID) != 1 {
		t.Fatal("nothing must be inserted for a foreign or missing project")
	}
}

func TestProjectDuplicateValidatesStoredRoomData(t *testing.T) {
	repo := newFakeProjectRepo()
	svc := NewProjectService(repo)
	src := seedProject(repo, "owner")
	src.RoomData = models.RoomData{"dimensions": map[string]interface{}{"width": 4.0, "height": 1.2, "depth": 4.0}}

	_, err := svc.Duplicate(context.Background(), src.ID, "owner")
	assertValidationErr(t, err, ErrInvalidRoomData)
	if len(repo.byID) != 1 || repo.numbersIssued != 0 {
		t.Fatal("invalid source must not be copied nor consume a number")
	}
}

func TestProjectServicePropagatesRepositoryErrors(t *testing.T) {
	boom := errors.New("db down")
	ctx := context.Background()
	fav := true

	cases := map[string]struct {
		inject func(*fakeProjectRepo)
		call   func(*ProjectService) error
	}{
		"list": {func(r *fakeProjectRepo) { r.findAllErr = boom }, func(s *ProjectService) error {
			_, _, err := s.List(ctx, "owner", 1, 20, "")
			return err
		}},
		"get": {func(r *fakeProjectRepo) { r.findErr = boom }, func(s *ProjectService) error {
			_, err := s.GetByID(ctx, seededProjectID, "owner")
			return err
		}},
		"create number": {func(r *fakeProjectRepo) { r.nextNumberErr = boom }, func(s *ProjectService) error {
			_, err := s.Create(ctx, models.CreateProjectRequest{Name: "A"}, "owner")
			return err
		}},
		"create insert": {func(r *fakeProjectRepo) { r.insertErr = boom }, func(s *ProjectService) error {
			_, err := s.Create(ctx, models.CreateProjectRequest{Name: "A"}, "owner")
			return err
		}},
		"update find": {func(r *fakeProjectRepo) { r.findErr = boom }, func(s *ProjectService) error {
			_, err := s.Update(ctx, seededProjectID, "owner", models.UpdateProjectRequest{Name: "A", Status: "active", RoomData: validScene()})
			return err
		}},
		"update write": {func(r *fakeProjectRepo) { r.updateErr = boom }, func(s *ProjectService) error {
			_, err := s.Update(ctx, seededProjectID, "owner", models.UpdateProjectRequest{Name: "A", Status: "active", RoomData: validScene()})
			return err
		}},
		"patch find": {func(r *fakeProjectRepo) { r.findErr = boom }, func(s *ProjectService) error {
			_, err := s.Patch(ctx, seededProjectID, "owner", models.PatchProjectRequest{Favorite: &fav})
			return err
		}},
		"patch write": {func(r *fakeProjectRepo) { r.updateErr = boom }, func(s *ProjectService) error {
			_, err := s.Patch(ctx, seededProjectID, "owner", models.PatchProjectRequest{Favorite: &fav})
			return err
		}},
		"duplicate find": {func(r *fakeProjectRepo) { r.findErr = boom }, func(s *ProjectService) error {
			_, err := s.Duplicate(ctx, seededProjectID, "owner")
			return err
		}},
		"duplicate number": {func(r *fakeProjectRepo) { r.nextNumberErr = boom }, func(s *ProjectService) error {
			_, err := s.Duplicate(ctx, seededProjectID, "owner")
			return err
		}},
		"duplicate insert": {func(r *fakeProjectRepo) { r.insertErr = boom }, func(s *ProjectService) error {
			_, err := s.Duplicate(ctx, seededProjectID, "owner")
			return err
		}},
		"delete find": {func(r *fakeProjectRepo) { r.findErr = boom }, func(s *ProjectService) error {
			return s.Delete(ctx, seededProjectID, "owner")
		}},
		"delete write": {func(r *fakeProjectRepo) { r.deleteErr = boom }, func(s *ProjectService) error {
			return s.Delete(ctx, seededProjectID, "owner")
		}},
	}
	for name, tc := range cases {
		t.Run(name, func(t *testing.T) {
			repo := newFakeProjectRepo()
			seedProject(repo, "owner")
			tc.inject(repo)
			err := tc.call(NewProjectService(repo))
			if !errors.Is(err, boom) {
				t.Fatalf("expected the repository error to propagate, got %v", err)
			}
			if IsValidationError(err) {
				t.Fatal("repository errors must not be reported as validation errors")
			}
		})
	}
}

func TestProjectDuplicateUnencodableSceneIsInternalError(t *testing.T) {
	repo := newFakeProjectRepo()
	svc := NewProjectService(repo)
	src := seedProject(repo, "owner")
	src.RoomData = models.RoomData{"bad": math.Inf(1)}

	_, err := svc.Duplicate(context.Background(), src.ID, "owner")
	if err == nil || IsValidationError(err) {
		t.Fatalf("a broken stored document is a server-side problem, got %v", err)
	}
	if len(repo.byID) != 1 {
		t.Fatal("nothing must be inserted")
	}
}
