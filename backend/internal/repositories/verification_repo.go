package repositories

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/execada/VRHomeConstruction/backend/internal/models"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

type VerificationRepo struct {
	collection *mongo.Collection
}

func NewVerificationRepo(db *mongo.Database) *VerificationRepo {
	return &VerificationRepo{
		collection: db.Collection("verification_codes"),
	}
}

// Upsert сохраняет новый код для пары email+purpose; счётчик попыток обнуляется.
func (r *VerificationRepo) Upsert(ctx context.Context, record *models.VerificationRecord) error {
	filter := bson.M{"email": record.Email, "purpose": record.Purpose}
	update := bson.M{
		"$set": bson.M{
			"codeHash":     record.CodeHash,
			"expiresAt":    record.ExpiresAt,
			"lastSentAt":   record.LastSentAt,
			"attempts":     0,
			"name":         record.Name,
			"passwordHash": record.PasswordHash,
			"userId":       record.UserID,
			"tokenHash":    record.TokenHash,
		},
		"$setOnInsert": bson.M{"_id": record.ID},
	}
	opts := options.Update().SetUpsert(true)
	_, err := r.collection.UpdateOne(ctx, filter, update, opts)
	// Одновременные upsert-ы по одной паре email+purpose могут споткнуться об
	// уникальный индекс; повтор попадает в уже созданный документ.
	if mongo.IsDuplicateKeyError(err) {
		_, err = r.collection.UpdateOne(ctx, filter, update, opts)
	}
	if err != nil {
		return fmt.Errorf("upsert verification code: %w", err)
	}
	return nil
}

// FindValid возвращает действующую запись кода (nil — нет или истекла).
func (r *VerificationRepo) FindValid(ctx context.Context, email, purpose string) (*models.VerificationRecord, error) {
	var record models.VerificationRecord
	err := r.collection.FindOne(ctx, bson.M{
		"email":     email,
		"purpose":   purpose,
		"expiresAt": bson.M{"$gt": time.Now()},
	}).Decode(&record)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("find verification code: %w", err)
	}
	return &record, nil
}

// ConsumeAttempt атомарно тратит одну попытку ввода кода: счётчик растёт только у
// действующей записи с подходящим ключом и неисчерпанными попытками, запись
// возвращается уже с увеличенным счётчиком. Сравнение кода — после этого, поэтому
// параллельные запросы не получат больше maxAttempts проверок.
// nil — подходящей записи нет (истекла, попытки исчерпаны, чужой запрос).
func (r *VerificationRepo) ConsumeAttempt(ctx context.Context, key models.VerificationKey, maxAttempts int) (*models.VerificationRecord, error) {
	filter := bson.M{
		"email":     key.Email,
		"purpose":   key.Purpose,
		"expiresAt": bson.M{"$gt": time.Now()},
		"attempts":  bson.M{"$lt": maxAttempts},
	}
	if key.UserID != "" {
		filter["userId"] = key.UserID
	}
	if key.TokenHash != "" {
		filter["tokenHash"] = key.TokenHash
	}

	var record models.VerificationRecord
	err := r.collection.FindOneAndUpdate(
		ctx,
		filter,
		bson.M{"$inc": bson.M{"attempts": 1}},
		options.FindOneAndUpdate().SetReturnDocument(options.After),
	).Decode(&record)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("consume verification attempt: %w", err)
	}
	return &record, nil
}

func (r *VerificationRepo) Delete(ctx context.Context, email, purpose string) error {
	if _, err := r.collection.DeleteOne(ctx, bson.M{"email": email, "purpose": purpose}); err != nil {
		return fmt.Errorf("delete verification code: %w", err)
	}
	return nil
}
