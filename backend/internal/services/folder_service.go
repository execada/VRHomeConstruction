package services

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/execada/VRHomeConstruction/backend/internal/models"
	"go.mongodb.org/mongo-driver/bson/primitive"
)

var (
	ErrFolderNotFound  = errors.New("folder not found")
	ErrFolderForbidden = errors.New("folder forbidden")
)

// folderRepository — зависимость сервиса от хранилища папок (для мокирования в тестах).
// Update/Delete действуют только на папку владельца и сообщают, нашлась ли она.
type folderRepository interface {
	FindAll(ctx context.Context, userID string) ([]models.Folder, error)
	FindByID(ctx context.Context, id string) (*models.Folder, error)
	Insert(ctx context.Context, folder *models.Folder) error
	Update(ctx context.Context, id, userID string, folder *models.Folder) (bool, error)
	Delete(ctx context.Context, id, userID string) (bool, error)
}

type FolderService struct {
	repo folderRepository
}

func NewFolderService(repo folderRepository) *FolderService {
	return &FolderService{repo: repo}
}

func (s *FolderService) GetTree(ctx context.Context, userID string) ([]models.FolderTree, error) {
	folders, err := s.repo.FindAll(ctx, userID)
	if err != nil {
		return nil, fmt.Errorf("list folders: %w", err)
	}
	return buildFolderTree(folders), nil
}

// buildFolderTree собирает иерархию папок из плоского списка.
// Использует промежуточные указатели и финальную рекурсивную конвертацию,
// поэтому корректно работает при произвольном порядке элементов и любой глубине вложенности.
// Папки, чей parentId указывает на несуществующую папку, считаются корневыми.
func buildFolderTree(folders []models.Folder) []models.FolderTree {
	type pnode struct {
		folder   models.Folder
		children []*pnode
	}

	nodes := make(map[string]*pnode, len(folders))
	for i := range folders {
		nodes[folders[i].ID] = &pnode{folder: folders[i]}
	}

	var roots []*pnode
	for i := range folders {
		f := folders[i]
		n := nodes[f.ID]
		if f.ParentID != nil && *f.ParentID != "" {
			if parent, ok := nodes[*f.ParentID]; ok {
				parent.children = append(parent.children, n)
				continue
			}
		}
		roots = append(roots, n)
	}

	var convert func(n *pnode) models.FolderTree
	convert = func(n *pnode) models.FolderTree {
		tree := models.FolderTree{Folder: n.folder}
		for _, child := range n.children {
			tree.Children = append(tree.Children, convert(child))
		}
		return tree
	}

	result := make([]models.FolderTree, 0, len(roots))
	for _, r := range roots {
		result = append(result, convert(r))
	}
	return result
}

func (s *FolderService) GetByID(ctx context.Context, id, userID string) (*models.Folder, error) {
	folder, err := s.repo.FindByID(ctx, id)
	if err != nil {
		return nil, fmt.Errorf("find folder %s: %w", id, err)
	}
	if folder == nil {
		return nil, ErrFolderNotFound
	}
	if folder.UserID != userID {
		return nil, ErrFolderForbidden
	}
	return folder, nil
}

func (s *FolderService) Create(ctx context.Context, req models.CreateFolderRequest, userID string) (*models.Folder, error) {
	id := primitive.NewObjectID().Hex()
	meta, err := s.validateMeta(ctx, userID, id, req.Name, req.Description, req.ParentID)
	if err != nil {
		return nil, err
	}

	now := time.Now()
	folder := &models.Folder{
		ID:             id,
		Name:           meta.name,
		Description:    meta.description,
		UserID:         userID,
		ParentID:       meta.parentID,
		ProjectIDs:     []string{},
		LayoutIDs:      []string{},
		ChildFolderIDs: []string{},
		CreatedAt:      now,
		UpdatedAt:      now,
	}
	if err := s.repo.Insert(ctx, folder); err != nil {
		return nil, fmt.Errorf("insert folder: %w", err)
	}
	return folder, nil
}

func (s *FolderService) Update(ctx context.Context, id, userID string, req models.UpdateFolderRequest) (*models.Folder, error) {
	existing, err := s.GetByID(ctx, id, userID)
	if err != nil {
		return nil, err
	}
	meta, err := s.validateMeta(ctx, userID, id, req.Name, req.Description, req.ParentID)
	if err != nil {
		return nil, err
	}
	members, err := validateMembers(req)
	if err != nil {
		return nil, err
	}

	folder := &models.Folder{
		ID:             id,
		Name:           meta.name,
		Description:    meta.description,
		UserID:         existing.UserID,
		ParentID:       meta.parentID,
		ProjectIDs:     members.projects,
		LayoutIDs:      members.layouts,
		ChildFolderIDs: members.children,
		CreatedAt:      existing.CreatedAt,
		UpdatedAt:      time.Now(),
	}
	updated, err := s.repo.Update(ctx, id, userID, folder)
	if err != nil {
		return nil, fmt.Errorf("update folder %s: %w", id, err)
	}
	if !updated {
		return nil, ErrFolderNotFound
	}
	return folder, nil
}

func (s *FolderService) Delete(ctx context.Context, id, userID string) error {
	if _, err := s.GetByID(ctx, id, userID); err != nil {
		return err
	}
	deleted, err := s.repo.Delete(ctx, id, userID)
	if err != nil {
		return fmt.Errorf("delete folder %s: %w", id, err)
	}
	if !deleted {
		return ErrFolderNotFound
	}
	return nil
}

// folderMeta — проверенные название, описание и родитель папки.
type folderMeta struct {
	name        string
	description *string
	parentID    *string
}

func (s *FolderService) validateMeta(ctx context.Context, userID, folderID, rawName string, rawDescription, rawParent *string) (folderMeta, error) {
	name, err := normalizeName(rawName, maxFolderNameLen)
	if err != nil {
		return folderMeta{}, err
	}
	var description *string
	if rawDescription != nil {
		d, err := normalizeDescription(*rawDescription)
		if err != nil {
			return folderMeta{}, err
		}
		description = &d
	}
	parentID, err := s.validateParent(ctx, userID, folderID, rawParent)
	if err != nil {
		return folderMeta{}, err
	}
	return folderMeta{name: name, description: description, parentID: parentID}, nil
}

// validateParent: родитель — своя существующая папка, не сама папка и не её потомок
// (иначе поддерево «пропало» бы из дерева без корня). nil или "" — корневая папка.
func (s *FolderService) validateParent(ctx context.Context, userID, folderID string, raw *string) (*string, error) {
	if raw == nil || strings.TrimSpace(*raw) == "" {
		return nil, nil
	}
	parentID := strings.TrimSpace(*raw)
	if !idPattern.MatchString(parentID) {
		return nil, newValidationError(ErrInvalidFolder, "invalid parentId")
	}
	if parentID == folderID {
		return nil, newValidationError(ErrInvalidFolder, "folder cannot be its own parent")
	}

	folders, err := s.repo.FindAll(ctx, userID)
	if err != nil {
		return nil, fmt.Errorf("list folders: %w", err)
	}
	byID := make(map[string]*models.Folder, len(folders))
	for i := range folders {
		byID[folders[i].ID] = &folders[i]
	}
	if byID[parentID] == nil {
		return nil, newValidationError(ErrInvalidFolder, "parent folder not found")
	}
	// Идём вверх от родителя: встретили саму папку — получился бы цикл.
	for cur, steps := parentID, 0; cur != "" && steps <= len(folders); steps++ {
		if cur == folderID {
			return nil, newValidationError(ErrInvalidFolder, "folder cannot be moved into its own subfolder")
		}
		f := byID[cur]
		if f == nil || f.ParentID == nil {
			break
		}
		cur = *f.ParentID
	}
	return &parentID, nil
}

// folderMembers — проверенные списки содержимого папки.
type folderMembers struct {
	projects, layouts, children []string
}

func validateMembers(req models.UpdateFolderRequest) (folderMembers, error) {
	projects, err := normalizeIDList(req.ProjectIDs, maxFolderItems, "projectIds")
	if err != nil {
		return folderMembers{}, err
	}
	layouts, err := normalizeIDList(req.LayoutIDs, maxFolderItems, "layoutIds")
	if err != nil {
		return folderMembers{}, err
	}
	children, err := normalizeIDList(req.ChildFolderIDs, maxFolderItems, "childFolderIds")
	if err != nil {
		return folderMembers{}, err
	}
	return folderMembers{projects: projects, layouts: layouts, children: children}, nil
}
