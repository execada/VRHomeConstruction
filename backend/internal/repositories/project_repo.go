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

type ProjectRepo struct {
	collection *mongo.Collection
	counters   *mongo.Collection
}

func NewProjectRepo(db *mongo.Database) *ProjectRepo {
	return &ProjectRepo{
		collection: db.Collection("projects"),
		counters:   db.Collection("counters"),
	}
}

// FindAll возвращает страницу проектов без roomData: сцена может весить мегабайты,
// а списку нужны только метаданные и превью.
func (r *ProjectRepo) FindAll(ctx context.Context, filter bson.M, page, limit int64) ([]models.Project, int64, error) {
	opts := options.Find().
		SetSkip((page - 1) * limit).
		SetLimit(limit).
		SetSort(bson.D{{Key: "updatedAt", Value: -1}}).
		SetProjection(bson.M{"roomData": 0})

	cursor, err := r.collection.Find(ctx, filter, opts)
	if err != nil {
		return nil, 0, fmt.Errorf("find projects: %w", err)
	}
	defer cursor.Close(ctx)

	// Пустой результат должен сериализоваться в [], а не null.
	projects := []models.Project{}
	if err := cursor.All(ctx, &projects); err != nil {
		return nil, 0, fmt.Errorf("decode projects: %w", err)
	}

	total, err := r.collection.CountDocuments(ctx, filter)
	if err != nil {
		return nil, 0, fmt.Errorf("count projects: %w", err)
	}
	return projects, total, nil
}

// Count — сколько проектов у пользователя (для квоты).
func (r *ProjectRepo) Count(ctx context.Context, userID string) (int64, error) {
	n, err := r.collection.CountDocuments(ctx, bson.M{"userId": userID})
	if err != nil {
		return 0, fmt.Errorf("count projects: %w", err)
	}
	return n, nil
}

func (r *ProjectRepo) FindByID(ctx context.Context, id string) (*models.Project, error) {
	var project models.Project
	err := r.collection.FindOne(ctx, bson.M{"_id": id}).Decode(&project)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("find project: %w", err)
	}
	return &project, nil
}

// NextNumber атомарно выдаёт следующий порядковый номер проекта пользователя
// через коллекцию-счётчик — при одновременном создании дублей не будет.
func (r *ProjectRepo) NextNumber(ctx context.Context, userID string) (int, error) {
	var doc struct {
		Seq int `bson:"seq"`
	}
	err := r.counters.FindOneAndUpdate(
		ctx,
		bson.M{"_id": "project_number:" + userID},
		bson.M{"$inc": bson.M{"seq": 1}},
		options.FindOneAndUpdate().SetUpsert(true).SetReturnDocument(options.After),
	).Decode(&doc)
	if err != nil {
		return 0, fmt.Errorf("next project number: %w", err)
	}
	return doc.Seq, nil
}

func (r *ProjectRepo) Insert(ctx context.Context, project *models.Project) error {
	if _, err := r.collection.InsertOne(ctx, project); err != nil {
		return fmt.Errorf("insert project: %w", err)
	}
	return nil
}

// Update меняет поля проекта владельца. false — проект не найден (удалён между
// проверкой и записью или принадлежит другому пользователю).
func (r *ProjectRepo) Update(ctx context.Context, id, userID string, update bson.M) (bool, error) {
	res, err := r.collection.UpdateOne(ctx, bson.M{"_id": id, "userId": userID}, bson.M{"$set": update})
	if err != nil {
		return false, fmt.Errorf("update project: %w", err)
	}
	return res.MatchedCount > 0, nil
}

// Delete удаляет проект владельца; false — удалять нечего.
func (r *ProjectRepo) Delete(ctx context.Context, id, userID string) (bool, error) {
	res, err := r.collection.DeleteOne(ctx, bson.M{"_id": id, "userId": userID})
	if err != nil {
		return false, fmt.Errorf("delete project: %w", err)
	}
	return res.DeletedCount > 0, nil
}
