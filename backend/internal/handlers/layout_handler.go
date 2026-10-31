package handlers

import (
	"net/http"

	"github.com/execada/VRHomeConstruction/backend/internal/middleware"
	"github.com/execada/VRHomeConstruction/backend/internal/models"
	"github.com/execada/VRHomeConstruction/backend/internal/services"
	"github.com/gin-gonic/gin"
)

type LayoutHandler struct {
	service *services.LayoutService
}

func NewLayoutHandler(service *services.LayoutService) *LayoutHandler {
	return &LayoutHandler{service: service}
}

func respondLayoutError(c *gin.Context, err error) {
	respondServiceError(c, err, "layout not found", services.ErrLayoutNotFound, services.ErrLayoutForbidden)
}

// List — GET /api/layouts: шаблоны пользователя без roomData.
func (h *LayoutHandler) List(c *gin.Context) {
	layouts, err := h.service.List(c.Request.Context(), middleware.GetUserID(c))
	if err != nil {
		respondInternalError(c, err)
		return
	}
	if layouts == nil {
		layouts = []models.Layout{}
	}
	c.JSON(http.StatusOK, layouts)
}

// GetByID — GET /api/layouts/:id: шаблон целиком, вместе с roomData.
func (h *LayoutHandler) GetByID(c *gin.Context) {
	layout, err := h.service.GetByID(c.Request.Context(), c.Param("id"), middleware.GetUserID(c))
	if err != nil {
		respondLayoutError(c, err)
		return
	}
	c.JSON(http.StatusOK, layout)
}

func (h *LayoutHandler) Create(c *gin.Context) {
	var req models.CreateLayoutRequest
	if !bindJSON(c, &req) {
		return
	}

	layout, err := h.service.Create(c.Request.Context(), req, middleware.GetUserID(c))
	if err != nil {
		respondLayoutError(c, err)
		return
	}
	c.JSON(http.StatusCreated, layout)
}

func (h *LayoutHandler) Update(c *gin.Context) {
	var req models.UpdateLayoutRequest
	if !bindJSON(c, &req) {
		return
	}

	layout, err := h.service.Update(c.Request.Context(), c.Param("id"), middleware.GetUserID(c), req)
	if err != nil {
		respondLayoutError(c, err)
		return
	}
	c.JSON(http.StatusOK, layout)
}

func (h *LayoutHandler) Delete(c *gin.Context) {
	if err := h.service.Delete(c.Request.Context(), c.Param("id"), middleware.GetUserID(c)); err != nil {
		respondLayoutError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "deleted"})
}
