package repositories

import (
	"context"
	"errors"
	"fmt"

	"github.com/execada/VRHomeConstruction/backend/internal/models"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

type FolderRepo struct {
	collection *mongo.Collection
}

func NewFolderRepo(db *mongo.Database) *FolderRepo {
	return &FolderRepo{
		collection: db.Collection("folders"),
	}
}

func (r *FolderRepo) FindAll(ctx context.Context, userID string) ([]models.Folder, error) {
	opts := options.Find().SetSort(bson.D{{Key: "createdAt", Value: 1}})
	cursor, err := r.collection.Find(ctx, bson.M{"userId": userID}, opts)
	if err != nil {
		return nil, fmt.Errorf("find folders: %w", err)
	}
	defer cursor.Close(ctx)

	// Пустой результат должен сериализоваться в [], а не null.
	folders := []models.Folder{}
	if err := cursor.All(ctx, &folders); err != nil {
		return nil, fmt.Errorf("decode folders: %w", err)
	}
	return folders, nil
}

func (r *FolderRepo) FindByID(ctx context.Context, id string) (*models.Folder, error) {
	var folder models.Folder
	err := r.collection.FindOne(ctx, bson.M{"_id": id}).Decode(&folder)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("find folder: %w", err)
	}
	return &folder, nil
}

func (r *FolderRepo) Insert(ctx context.Context, folder *models.Folder) error {
	if _, err := r.collection.InsertOne(ctx, folder); err != nil {
		return fmt.Errorf("insert folder: %w", err)
	}
	return nil
}

// Update заменяет папку владельца; false — папка не найдена.
func (r *FolderRepo) Update(ctx context.Context, id, userID string, folder *models.Folder) (bool, error) {
	res, err := r.collection.ReplaceOne(ctx, bson.M{"_id": id, "userId": userID}, folder)
	if err != nil {
		return false, fmt.Errorf("update folder: %w", err)
	}
	return res.MatchedCount > 0, nil
}

// Delete удаляет папку владельца; false — удалять нечего.
func (r *FolderRepo) Delete(ctx context.Context, id, userID string) (bool, error) {
	res, err := r.collection.DeleteOne(ctx, bson.M{"_id": id, "userId": userID})
	if err != nil {
		return false, fmt.Errorf("delete folder: %w", err)
	}
	return res.DeletedCount > 0, nil
}

// RemoveProject убирает удалённый проект из всех папок пользователя.
func (r *FolderRepo) RemoveProject(ctx context.Context, userID, projectID string) error {
	_, err := r.collection.UpdateMany(ctx,
		bson.M{"userId": userID, "projectIds": projectID},
		bson.M{"$pull": bson.M{"projectIds": projectID}},
	)
	if err != nil {
		return fmt.Errorf("remove project from folders: %w", err)
	}
	return nil
}
