package repositories

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/execada/VRHomeConstruction/backend/internal/models"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

type UserRepo struct {
	collection *mongo.Collection
}

func NewUserRepo(db *mongo.Database) *UserRepo {
	return &UserRepo{
		collection: db.Collection("users"),
	}
}

func (r *UserRepo) FindByEmail(ctx context.Context, email string) (*models.User, error) {
	var user models.User
	err := r.collection.FindOne(ctx, bson.M{"email": normalizeEmail(email)}).Decode(&user)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("find user by email: %w", err)
	}
	return &user, nil
}

// FindByUsername ищет администратора по логину (регистр и пробелы по краям не важны).
func (r *UserRepo) FindByUsername(ctx context.Context, username string) (*models.User, error) {
	var user models.User
	err := r.collection.FindOne(ctx, bson.M{"username": normalizeEmail(username)}).Decode(&user)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("find user by username: %w", err)
	}
	return &user, nil
}

func (r *UserRepo) FindByID(ctx context.Context, id string) (*models.User, error) {
	var user models.User
	err := r.collection.FindOne(ctx, bson.M{"_id": id}).Decode(&user)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("find user: %w", err)
	}
	return &user, nil
}

// Insert добавляет пользователя. Занятый email — ошибка уникального индекса
// (mongo.IsDuplicateKeyError распознаёт её и в обёртке).
func (r *UserRepo) Insert(ctx context.Context, user *models.User) error {
	if _, err := r.collection.InsertOne(ctx, user); err != nil {
		return fmt.Errorf("insert user: %w", err)
	}
	return nil
}

// UpdateName меняет имя и возвращает обновлённого пользователя (nil — такого нет).
func (r *UserRepo) UpdateName(ctx context.Context, id, name string) (*models.User, error) {
	return r.updateFields(ctx, id, bson.M{"name": name})
}

// UpdateCredentials задаёт новый хэш пароля и роль (nil — пользователя нет).
func (r *UserRepo) UpdateCredentials(ctx context.Context, id, passwordHash, role string) (*models.User, error) {
	return r.updateFields(ctx, id, bson.M{"passwordHash": passwordHash, "role": role})
}

// UpdateEmail меняет email. Занятый адрес даёт ошибку уникального индекса
// (mongo.IsDuplicateKeyError) — её обрабатывает сервис.
func (r *UserRepo) UpdateEmail(ctx context.Context, id, email string) (*models.User, error) {
	return r.updateFields(ctx, id, bson.M{"email": normalizeEmail(email)})
}

func (r *UserRepo) updateFields(ctx context.Context, id string, fields bson.M) (*models.User, error) {
	var user models.User
	err := r.collection.FindOneAndUpdate(
		ctx,
		bson.M{"_id": id},
		bson.M{"$set": fields},
		options.FindOneAndUpdate().SetReturnDocument(options.After),
	).Decode(&user)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("update user: %w", err)
	}
	return &user, nil
}

// normalizeEmail приводит почту или логин к виду, в котором они хранятся.
func normalizeEmail(email string) string {
	return strings.ToLower(strings.TrimSpace(email))
}
