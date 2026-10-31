package handlers

import (
	"math"
	"net/http"

	"github.com/execada/VRHomeConstruction/backend/internal/middleware"
	"github.com/execada/VRHomeConstruction/backend/internal/models"
	"github.com/execada/VRHomeConstruction/backend/internal/services"
	"github.com/gin-gonic/gin"
)

type ProjectHandler struct {
	service *services.ProjectService
}

func NewProjectHandler(service *services.ProjectService) *ProjectHandler {
	return &ProjectHandler{service: service}
}

func respondProjectError(c *gin.Context, err error) {
	respondServiceError(c, err, "project not found", services.ErrProjectNotFound, services.ErrProjectForbidden)
}

// List — GET /api/projects?page&limit&status: лёгкий список без roomData.
func (h *ProjectHandler) List(c *gin.Context) {
	userID := middleware.GetUserID(c)
	page, limit := parsePagination(c)
	status := c.Query("status")

	projects, total, err := h.service.List(c.Request.Context(), userID, page, limit, status)
	if err != nil {
		respondInternalError(c, err)
		return
	}
	if projects == nil {
		projects = []models.Project{}
	}

	c.JSON(http.StatusOK, gin.H{
		"data":  projects,
		"total": total,
		"page":  page,
		"limit": limit,
		"pages": int(math.Ceil(float64(total) / float64(limit))),
	})
}

func (h *ProjectHandler) GetByID(c *gin.Context) {
	project, err := h.service.GetByID(c.Request.Context(), c.Param("id"), middleware.GetUserID(c))
	if err != nil {
		respondProjectError(c, err)
		return
	}
	c.JSON(http.StatusOK, project)
}

func (h *ProjectHandler) Create(c *gin.Context) {
	var req models.CreateProjectRequest
	if !bindJSON(c, &req) {
		return
	}

	project, err := h.service.Create(c.Request.Context(), req, middleware.GetUserID(c))
	if err != nil {
		respondProjectError(c, err)
		return
	}
	c.JSON(http.StatusCreated, project)
}

// Update — PUT /api/projects/:id: полное сохранение сцены.
func (h *ProjectHandler) Update(c *gin.Context) {
	var req models.UpdateProjectRequest
	if !bindJSON(c, &req) {
		return
	}

	project, err := h.service.Update(c.Request.Context(), c.Param("id"), middleware.GetUserID(c), req)
	if err != nil {
		respondProjectError(c, err)
		return
	}
	c.JSON(http.StatusOK, project)
}

// Patch — PATCH /api/projects/:id: частичное обновление метаданных.
func (h *ProjectHandler) Patch(c *gin.Context) {
	var req models.PatchProjectRequest
	if !bindJSON(c, &req) {
		return
	}

	project, err := h.service.Patch(c.Request.Context(), c.Param("id"), middleware.GetUserID(c), req)
	if err != nil {
		respondProjectError(c, err)
		return
	}
	c.JSON(http.StatusOK, project)
}

// Duplicate — POST /api/projects/:id/duplicate: копия проекта того же владельца.
func (h *ProjectHandler) Duplicate(c *gin.Context) {
	project, err := h.service.Duplicate(c.Request.Context(), c.Param("id"), middleware.GetUserID(c))
	if err != nil {
		respondProjectError(c, err)
		return
	}
	c.JSON(http.StatusCreated, project)
}

func (h *ProjectHandler) Delete(c *gin.Context) {
	if err := h.service.Delete(c.Request.Context(), c.Param("id"), middleware.GetUserID(c)); err != nil {
		respondProjectError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "deleted"})
}
