package services

import (
	"context"
	"errors"
	"fmt"
	"log"
	"maps"
	"slices"
	"strings"
	"time"

	"github.com/execada/VRHomeConstruction/backend/internal/models"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
)

const defaultProjectStatus = "draft"

var (
	ErrProjectNotFound  = errors.New("project not found")
	ErrProjectForbidden = errors.New("project forbidden")
)

// projectRepository — зависимость сервиса от хранилища проектов.
// Объявлена на стороне потребителя, чтобы сервис можно было тестировать с фейком.
// FindAll возвращает проекты без roomData (лёгкий список).
// Update/Delete действуют только на проект владельца и сообщают, нашёлся ли он.
type projectRepository interface {
	FindAll(ctx context.Context, filter bson.M, page, limit int64) ([]models.Project, int64, error)
	Count(ctx context.Context, userID string) (int64, error)
	FindByID(ctx context.Context, id string) (*models.Project, error)
	NextNumber(ctx context.Context, userID string) (int, error)
	Insert(ctx context.Context, project *models.Project) error
	Update(ctx context.Context, id, userID string, update bson.M) (bool, error)
	Delete(ctx context.Context, id, userID string) (bool, error)
}

// projectFolderCleaner убирает удалённый проект из папок (необязательная зависимость).
type projectFolderCleaner interface {
	RemoveProject(ctx context.Context, userID, projectID string) error
}

type ProjectService struct {
	repo    projectRepository
	folders projectFolderCleaner
}

func NewProjectService(repo projectRepository) *ProjectService {
	return &ProjectService{repo: repo}
}

// WithFolderCleanup возвращает сервис, который при удалении проекта убирает его из папок.
func (s *ProjectService) WithFolderCleanup(folders projectFolderCleaner) *ProjectService {
	return &ProjectService{repo: s.repo, folders: folders}
}

func (s *ProjectService) List(ctx context.Context, userID string, page, limit int64, status string) ([]models.Project, int64, error) {
	page, limit = NormalizePagination(page, limit)

	filter := bson.M{"userId": userID}
	if status != "" {
		filter["status"] = status
	}

	projects, total, err := s.repo.FindAll(ctx, filter, page, limit)
	if err != nil {
		return nil, 0, fmt.Errorf("list projects: %w", err)
	}
	return projects, total, nil
}

func (s *ProjectService) GetByID(ctx context.Context, id, userID string) (*models.Project, error) {
	return s.findOwned(ctx, id, userID)
}

func (s *ProjectService) Create(ctx context.Context, req models.CreateProjectRequest, userID string) (*models.Project, error) {
	input, err := validateNewProject(req)
	if err != nil {
		return nil, err
	}
	if err := s.checkQuota(ctx, userID); err != nil {
		return nil, err
	}

	// Порядковый номер проекта в рамках пользователя (для отображения "#N").
	number, err := s.repo.NextNumber(ctx, userID)
	if err != nil {
		return nil, fmt.Errorf("next project number: %w", err)
	}

	now := time.Now()
	project := &models.Project{
		ID:          primitive.NewObjectID().Hex(),
		Name:        input.name,
		Description: input.description,
		Tags:        input.tags,
		Template:    input.template,
		Number:      &number,
		CreatedAt:   now,
		UpdatedAt:   now,
		UserID:      userID,
		Status:      input.status,
		RoomData:    input.roomData,
	}

	if err := s.repo.Insert(ctx, project); err != nil {
		return nil, fmt.Errorf("insert project: %w", err)
	}
	return project, nil
}

// Update — полное сохранение сцены (PUT): name/status/roomData обязательны.
func (s *ProjectService) Update(ctx context.Context, id, userID string, req models.UpdateProjectRequest) (*models.Project, error) {
	existing, err := s.findOwned(ctx, id, userID)
	if err != nil {
		return nil, err
	}

	updated, set, err := applyProjectSave(*existing, req)
	if err != nil {
		return nil, err
	}
	return s.persist(ctx, updated, set)
}

// Patch — частичное обновление метаданных: меняются только переданные поля.
func (s *ProjectService) Patch(ctx context.Context, id, userID string, req models.PatchProjectRequest) (*models.Project, error) {
	existing, err := s.findOwned(ctx, id, userID)
	if err != nil {
		return nil, err
	}

	updated, set, err := applyProjectPatch(*existing, req)
	if err != nil {
		return nil, err
	}
	if len(set) == 0 {
		return existing, nil
	}
	return s.persist(ctx, updated, set)
}

// Duplicate создаёт копию проекта того же владельца: новый id и номер, свежие
// даты, favorite сброшен; сцена копируется глубоко и проверяется заново.
func (s *ProjectService) Duplicate(ctx context.Context, id, userID string) (*models.Project, error) {
	source, err := s.findOwned(ctx, id, userID)
	if err != nil {
		return nil, err
	}
	if err := s.checkQuota(ctx, userID); err != nil {
		return nil, err
	}

	roomData, err := copyRoomData(source.RoomData)
	if err != nil {
		return nil, err
	}

	number, err := s.repo.NextNumber(ctx, userID)
	if err != nil {
		return nil, fmt.Errorf("next project number: %w", err)
	}

	now := time.Now()
	project := &models.Project{
		ID:             primitive.NewObjectID().Hex(),
		Name:           duplicateName(source.Name),
		Description:    source.Description,
		Tags:           append([]string{}, source.Tags...),
		Favorite:       false,
		Thumbnail:      source.Thumbnail,
		Template:       cloneStringPtr(source.Template),
		Number:         &number,
		CreatedAt:      now,
		UpdatedAt:      now,
		UserID:         userID,
		Status:         source.Status,
		RoomData:       roomData,
		PlayerPosition: slices.Clone(source.PlayerPosition),
		PlayerRotation: slices.Clone(source.PlayerRotation),
	}

	if err := s.repo.Insert(ctx, project); err != nil {
		return nil, fmt.Errorf("insert project copy: %w", err)
	}
	return project, nil
}

func (s *ProjectService) Delete(ctx context.Context, id, userID string) error {
	if _, err := s.findOwned(ctx, id, userID); err != nil {
		return err
	}
	deleted, err := s.repo.Delete(ctx, id, userID)
	if err != nil {
		return fmt.Errorf("delete project %s: %w", id, err)
	}
	if !deleted {
		return ErrProjectNotFound
	}
	// Ссылки на удалённый проект в папках не мешают работе — сбой очистки только логируем.
	if s.folders != nil {
		if err := s.folders.RemoveProject(ctx, userID, id); err != nil {
			log.Printf("[PROJECTS] remove deleted project %s from folders: %v", id, err)
		}
	}
	return nil
}

// checkQuota не даёт создать больше maxProjectsPerUser проектов.
func (s *ProjectService) checkQuota(ctx context.Context, userID string) error {
	count, err := s.repo.Count(ctx, userID)
	if err != nil {
		return fmt.Errorf("count projects: %w", err)
	}
	if count >= maxProjectsPerUser {
		return newValidationError(ErrProjectLimit, "project limit of %d reached — delete unused projects", maxProjectsPerUser)
	}
	return nil
}

// findOwned загружает проект и проверяет владельца.
func (s *ProjectService) findOwned(ctx context.Context, id, userID string) (*models.Project, error) {
	project, err := s.repo.FindByID(ctx, id)
	if err != nil {
		return nil, fmt.Errorf("find project %s: %w", id, err)
	}
	if project == nil {
		return nil, ErrProjectNotFound
	}
	if project.UserID != userID {
		return nil, ErrProjectForbidden
	}
	return project, nil
}

// persist проставляет updatedAt и записывает только поля из set (set вызывающего не меняется).
func (s *ProjectService) persist(ctx context.Context, p models.Project, set bson.M) (*models.Project, error) {
	now := time.Now()
	p.UpdatedAt = now
	update := maps.Clone(set)
	update["updatedAt"] = now
	updated, err := s.repo.Update(ctx, p.ID, p.UserID, update)
	if err != nil {
		return nil, fmt.Errorf("update project %s: %w", p.ID, err)
	}
	if !updated {
		return nil, ErrProjectNotFound
	}
	return &p, nil
}

// newProject — проверенные и нормализованные поля нового проекта.
type newProject struct {
	name, status, description string
	template                  *string
	tags                      []string
	roomData                  models.RoomData
}

func validateNewProject(req models.CreateProjectRequest) (newProject, error) {
	name, err := normalizeName(req.Name, maxProjectNameLen)
	if err != nil {
		return newProject{}, err
	}
	status := defaultProjectStatus
	if strings.TrimSpace(req.Status) != "" {
		if status, err = normalizeStatus(req.Status); err != nil {
			return newProject{}, err
		}
	}
	description, err := normalizeDescription(req.Description)
	if err != nil {
		return newProject{}, err
	}
	tags, err := normalizeTags(req.Tags)
	if err != nil {
		return newProject{}, err
	}
	template, err := normalizeTemplate(req.Template)
	if err != nil {
		return newProject{}, err
	}
	roomData := defaultRoomData()
	if req.RoomData != nil {
		if roomData, err = validateRoomData(req.RoomData); err != nil {
			return newProject{}, err
		}
	}
	return newProject{name: name, status: status, description: description, template: template, tags: tags, roomData: roomData}, nil
}

// applyProjectSave проверяет тело PUT и возвращает копию проекта с изменениями и $set.
// template/thumbnail/поза камеры меняются, только если пришли в запросе: автосейв
// редактора их не всегда передаёт. description/tags/favorite PUT не трогает, номер
// проекта выдаёт только сервер.
func applyProjectSave(p models.Project, req models.UpdateProjectRequest) (models.Project, bson.M, error) {
	name, err := normalizeName(req.Name, maxProjectNameLen)
	if err != nil {
		return p, nil, err
	}
	status, err := normalizeStatus(req.Status)
	if err != nil {
		return p, nil, err
	}
	roomData, err := validateRequiredRoomData(req.RoomData)
	if err != nil {
		return p, nil, err
	}

	p.Name, p.Status, p.RoomData = name, status, roomData
	set := bson.M{"name": name, "status": status, "roomData": roomData}

	if req.Thumbnail != nil {
		thumbnail, err := validateThumbnail(*req.Thumbnail)
		if err != nil {
			return p, nil, err
		}
		p.Thumbnail, set["thumbnail"] = thumbnail, thumbnail
	}
	if req.Template != nil {
		template, err := normalizeTemplate(req.Template)
		if err != nil {
			return p, nil, err
		}
		p.Template, set["template"] = template, template
	}
	if req.PlayerPosition != nil {
		pose, err := validatePose(req.PlayerPosition)
		if err != nil {
			return p, nil, err
		}
		p.PlayerPosition, set["playerPosition"] = pose, pose
	}
	if req.PlayerRotation != nil {
		pose, err := validatePose(req.PlayerRotation)
		if err != nil {
			return p, nil, err
		}
		p.PlayerRotation, set["playerRotation"] = pose, pose
	}
	return p, set, nil
}

// applyProjectPatch проверяет переданные поля PATCH и возвращает копию проекта
// с изменениями и $set только для этих полей (пустой set — менять нечего).
func applyProjectPatch(p models.Project, req models.PatchProjectRequest) (models.Project, bson.M, error) {
	set := bson.M{}
	if req.Name != nil {
		name, err := normalizeName(*req.Name, maxProjectNameLen)
		if err != nil {
			return p, nil, err
		}
		p.Name, set["name"] = name, name
	}
	if req.Description != nil {
		description, err := normalizeDescription(*req.Description)
		if err != nil {
			return p, nil, err
		}
		p.Description, set["description"] = description, description
	}
	if req.Tags != nil {
		tags, err := normalizeTags(*req.Tags)
		if err != nil {
			return p, nil, err
		}
		p.Tags, set["tags"] = tags, tags
	}
	if req.Thumbnail != nil {
		thumbnail, err := validateThumbnail(*req.Thumbnail)
		if err != nil {
			return p, nil, err
		}
		p.Thumbnail, set["thumbnail"] = thumbnail, thumbnail
	}
	if req.Status != nil {
		status, err := normalizeStatus(*req.Status)
		if err != nil {
			return p, nil, err
		}
		p.Status, set["status"] = status, status
	}
	if req.Favorite != nil {
		p.Favorite, set["favorite"] = *req.Favorite, *req.Favorite
	}
	return p, set, nil
}

// copyRoomData — независимая копия сцены источника, заново проверенная.
func copyRoomData(src models.RoomData) (models.RoomData, error) {
	if src == nil {
		return nil, nil
	}
	clone, err := cloneRoomData(src)
	if err != nil {
		return nil, fmt.Errorf("copy roomData: %w", err)
	}
	return validateRoomData(clone)
}

func cloneStringPtr(p *string) *string {
	if p == nil {
		return nil
	}
	v := *p
	return &v
}
