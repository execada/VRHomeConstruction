package handlers

import (
	"errors"
	"net/http"
	"testing"

	"github.com/execada/VRHomeConstruction/backend/internal/models"
	"github.com/execada/VRHomeConstruction/backend/internal/services"
	"github.com/gin-gonic/gin"
)

func folderEngine(userID string, repo *memFolderRepo) *gin.Engine {
	r := newEngine(userID)
	h := NewFolderHandler(services.NewFolderService(repo))
	r.GET("/folders", h.GetTree)
	r.POST("/folders", h.Create)
	r.PUT("/folders/:id", h.Update)
	r.DELETE("/folders/:id", h.Delete)
	return r
}

func TestFolderEndpoints(t *testing.T) {
	repo := &memFolderRepo{byID: map[string]*models.Folder{}}
	r := folderEngine(ownerID, repo)

	if w := do(r, http.MethodGet, "/folders", ""); w.Code != http.StatusOK || w.Body.String() != "[]" {
		t.Fatalf("an empty tree must be [], got %d %s", w.Code, w.Body.String())
	}

	w := do(r, http.MethodPost, "/folders", `{"name":"  Кухни  "}`)
	if w.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d: %s", w.Code, w.Body.String())
	}
	id, _ := decode(t, w)["_id"].(string)
	if id == "" || repo.byID[id].Name != "Кухни" {
		t.Fatalf("expected a stored, trimmed folder, got %s", w.Body.String())
	}

	child := do(r, http.MethodPost, "/folders", `{"name":"Child","parentId":"`+id+`"}`)
	childID, _ := decode(t, child)["_id"].(string)
	expectError(t, do(r, http.MethodPut, "/folders/"+id, `{"name":"Loop","parentId":"`+childID+`"}`),
		http.StatusBadRequest, "folder cannot be moved into its own subfolder")
	expectError(t, do(r, http.MethodPost, "/folders", `{"name":"X","parentId":"ghost"}`),
		http.StatusBadRequest, "parent folder not found")
	expectError(t, do(r, http.MethodPost, "/folders", `{}`), http.StatusBadRequest, "invalid field: name")

	if w := do(r, http.MethodPut, "/folders/"+id, `{"name":"Кухни 2","projectIds":["p1"]}`); w.Code != http.StatusOK {
		t.Fatalf("owner update: expected 200, got %d: %s", w.Code, w.Body.String())
	}

	intruder := folderEngine("intruder", repo)
	expectError(t, do(intruder, http.MethodPut, "/folders/"+id, `{"name":"Mine"}`), http.StatusNotFound, "folder not found")
	expectError(t, do(intruder, http.MethodDelete, "/folders/"+id, ""), http.StatusNotFound, "folder not found")

	if w := do(r, http.MethodDelete, "/folders/"+id, ""); w.Code != http.StatusOK {
		t.Fatalf("owner delete: expected 200, got %d", w.Code)
	}
	expectError(t, do(r, http.MethodDelete, "/folders/"+id, ""), http.StatusNotFound, "folder not found")
}

func TestFolderTreeStorageFailureIsOpaque500(t *testing.T) {
	repo := &memFolderRepo{byID: map[string]*models.Folder{}, err: errors.New("mongo: connection refused to secret-host:27017")}
	expectError(t, do(folderEngine(ownerID, repo), http.MethodGet, "/folders", ""), http.StatusInternalServerError, "internal server error")
}
