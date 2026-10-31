package services

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/execada/VRHomeConstruction/backend/internal/models"
	"go.mongodb.org/mongo-driver/bson/primitive"
)

var (
	ErrLayoutNotFound  = errors.New("layout not found")
	ErrLayoutForbidden = errors.New("layout forbidden")
)

// layoutRepository — зависимость сервиса от хранилища раскладок (для мокирования в тестах).
// FindAll возвращает раскладки без roomData (лёгкий список). Update/Delete действуют
// только на раскладку владельца и сообщают, нашлась ли она.
type layoutRepository interface {
	FindAll(ctx context.Context, userID string) ([]models.Layout, error)
	FindByID(ctx context.Context, id string) (*models.Layout, error)
	Insert(ctx context.Context, layout *models.Layout) error
	Update(ctx context.Context, id, userID string, layout *models.Layout) (bool, error)
	Delete(ctx context.Context, id, userID string) (bool, error)
}

// LayoutService управляет раскладками — шаблонами комнат пользователя.
type LayoutService struct {
	repo layoutRepository
}

func NewLayoutService(repo layoutRepository) *LayoutService {
	return &LayoutService{repo: repo}
}

func (s *LayoutService) List(ctx context.Context, userID string) ([]models.Layout, error) {
	layouts, err := s.repo.FindAll(ctx, userID)
	if err != nil {
		return nil, fmt.Errorf("list layouts: %w", err)
	}
	return layouts, nil
}

func (s *LayoutService) GetByID(ctx context.Context, id, userID string) (*models.Layout, error) {
	layout, err := s.repo.FindByID(ctx, id)
	if err != nil {
		return nil, fmt.Errorf("find layout %s: %w", id, err)
	}
	if layout == nil {
		return nil, ErrLayoutNotFound
	}
	if layout.UserID != userID {
		return nil, ErrLayoutForbidden
	}
	return layout, nil
}

func (s *LayoutService) Create(ctx context.Context, req models.CreateLayoutRequest, userID string) (*models.Layout, error) {
	layout, err := applyLayoutRequest(models.Layout{}, req)
	if err != nil {
		return nil, err
	}

	now := time.Now()
	layout.ID = primitive.NewObjectID().Hex()
	layout.UserID = userID
	layout.CreatedAt = now
	layout.UpdatedAt = now

	if err := s.repo.Insert(ctx, &layout); err != nil {
		return nil, fmt.Errorf("insert layout: %w", err)
	}
	return &layout, nil
}

func (s *LayoutService) Update(ctx context.Context, id, userID string, req models.UpdateLayoutRequest) (*models.Layout, error) {
	existing, err := s.GetByID(ctx, id, userID)
	if err != nil {
		return nil, err
	}

	layout, err := applyLayoutRequest(*existing, req)
	if err != nil {
		return nil, err
	}
	layout.UpdatedAt = time.Now()

	updated, err := s.repo.Update(ctx, id, userID, &layout)
	if err != nil {
		return nil, fmt.Errorf("update layout %s: %w", id, err)
	}
	if !updated {
		return nil, ErrLayoutNotFound
	}
	return &layout, nil
}

func (s *LayoutService) Delete(ctx context.Context, id, userID string) error {
	if _, err := s.GetByID(ctx, id, userID); err != nil {
		return err
	}
	deleted, err := s.repo.Delete(ctx, id, userID)
	if err != nil {
		return fmt.Errorf("delete layout %s: %w", id, err)
	}
	if !deleted {
		return ErrLayoutNotFound
	}
	return nil
}

// applyLayoutRequest проверяет тело POST/PUT и возвращает копию раскладки с изменениями:
// name обязателен, остальные поля меняются, только если переданы.
func applyLayoutRequest(l models.Layout, req models.LayoutRequest) (models.Layout, error) {
	name, err := normalizeName(req.Name, maxProjectNameLen)
	if err != nil {
		return l, err
	}
	l.Name = name

	if req.Description != nil {
		description, err := normalizeDescription(*req.Description)
		if err != nil {
			return l, err
		}
		l.Description = description
	}
	if req.Thumbnail != nil {
		thumbnail, err := validateThumbnail(*req.Thumbnail)
		if err != nil {
			return l, err
		}
		l.Thumbnail = thumbnail
	}
	if req.RoomData != nil {
		roomData, err := validateRoomData(req.RoomData)
		if err != nil {
			return l, err
		}
		l.RoomData = roomData
	}
	return l, nil
}
