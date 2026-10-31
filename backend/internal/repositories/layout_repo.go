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

type LayoutRepo struct {
	collection *mongo.Collection
}

func NewLayoutRepo(db *mongo.Database) *LayoutRepo {
	return &LayoutRepo{
		collection: db.Collection("layouts"),
	}
}

// FindAll возвращает раскладки пользователя без roomData (лёгкий список шаблонов), свежие сверху.
func (r *LayoutRepo) FindAll(ctx context.Context, userID string) ([]models.Layout, error) {
	opts := options.Find().
		SetProjection(bson.M{"roomData": 0}).
		SetSort(bson.D{{Key: "updatedAt", Value: -1}})
	cursor, err := r.collection.Find(ctx, bson.M{"userId": userID}, opts)
	if err != nil {
		return nil, fmt.Errorf("find layouts: %w", err)
	}
	defer cursor.Close(ctx)

	// Пустой результат должен сериализоваться в [], а не null.
	layouts := []models.Layout{}
	if err := cursor.All(ctx, &layouts); err != nil {
		return nil, fmt.Errorf("decode layouts: %w", err)
	}
	return layouts, nil
}

func (r *LayoutRepo) FindByID(ctx context.Context, id string) (*models.Layout, error) {
	var layout models.Layout
	err := r.collection.FindOne(ctx, bson.M{"_id": id}).Decode(&layout)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("find layout: %w", err)
	}
	return &layout, nil
}

func (r *LayoutRepo) Insert(ctx context.Context, layout *models.Layout) error {
	if _, err := r.collection.InsertOne(ctx, layout); err != nil {
		return fmt.Errorf("insert layout: %w", err)
	}
	return nil
}

// Update заменяет раскладку владельца; false — раскладка не найдена.
func (r *LayoutRepo) Update(ctx context.Context, id, userID string, layout *models.Layout) (bool, error) {
	res, err := r.collection.ReplaceOne(ctx, bson.M{"_id": id, "userId": userID}, layout)
	if err != nil {
		return false, fmt.Errorf("update layout: %w", err)
	}
	return res.MatchedCount > 0, nil
}

// Delete удаляет раскладку владельца; false — удалять нечего.
func (r *LayoutRepo) Delete(ctx context.Context, id, userID string) (bool, error) {
	res, err := r.collection.DeleteOne(ctx, bson.M{"_id": id, "userId": userID})
	if err != nil {
		return false, fmt.Errorf("delete layout: %w", err)
	}
	return res.DeletedCount > 0, nil
}
