package handlers

import (
	"net/http"

	"github.com/execada/VRHomeConstruction/backend/internal/middleware"
	"github.com/execada/VRHomeConstruction/backend/internal/models"
	"github.com/execada/VRHomeConstruction/backend/internal/services"
	"github.com/gin-gonic/gin"
)

type FolderHandler struct {
	service *services.FolderService
}

func NewFolderHandler(service *services.FolderService) *FolderHandler {
	return &FolderHandler{service: service}
}

func respondFolderError(c *gin.Context, err error) {
	respondServiceError(c, err, "folder not found", services.ErrFolderNotFound, services.ErrFolderForbidden)
}

func (h *FolderHandler) GetTree(c *gin.Context) {
	tree, err := h.service.GetTree(c.Request.Context(), middleware.GetUserID(c))
	if err != nil {
		respondInternalError(c, err)
		return
	}
	if tree == nil {
		tree = []models.FolderTree{}
	}
	c.JSON(http.StatusOK, tree)
}

func (h *FolderHandler) Create(c *gin.Context) {
	var req models.CreateFolderRequest
	if !bindJSON(c, &req) {
		return
	}

	folder, err := h.service.Create(c.Request.Context(), req, middleware.GetUserID(c))
	if err != nil {
		respondFolderError(c, err)
		return
	}
	c.JSON(http.StatusCreated, folder)
}

func (h *FolderHandler) Update(c *gin.Context) {
	var req models.UpdateFolderRequest
	if !bindJSON(c, &req) {
		return
	}

	folder, err := h.service.Update(c.Request.Context(), c.Param("id"), middleware.GetUserID(c), req)
	if err != nil {
		respondFolderError(c, err)
		return
	}
	c.JSON(http.StatusOK, folder)
}

func (h *FolderHandler) Delete(c *gin.Context) {
	if err := h.service.Delete(c.Request.Context(), c.Param("id"), middleware.GetUserID(c)); err != nil {
		respondFolderError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "deleted"})
}
