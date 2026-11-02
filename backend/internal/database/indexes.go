package database

import (
	"context"
	"fmt"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

// EnsureIndexes создаёт индексы, необходимые для целостности и производительности.
// Вызывается при старте сервера; операция идемпотентна.
func EnsureIndexes(ctx context.Context, db *mongo.Database) error {
	ctx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()

	if err := dropLegacyIndexes(ctx, db); err != nil {
		return err
	}
	for collection, models := range indexModels() {
		if _, err := db.Collection(collection).Indexes().CreateMany(ctx, models); err != nil {
			return fmt.Errorf("create indexes for %s: %w", collection, err)
		}
	}
	return nil
}

func indexModels() map[string][]mongo.IndexModel {
	byUser := func(keys ...bson.E) mongo.IndexModel {
		return mongo.IndexModel{Keys: append(bson.D{{Key: "userId", Value: 1}}, keys...)}
	}
	return map[string][]mongo.IndexModel{
		// Уникальность email — защита от дублей пользователей при гонке регистраций.
		// Почта и логин уникальны; индексы разреженные: у администратора, входящего
		// по логину, может не быть почты, а у обычных пользователей нет логина.
		"users": {
			{Keys: bson.D{{Key: "email", Value: 1}}, Options: options.Index().SetUnique(true).SetSparse(true)},
			{Keys: bson.D{{Key: "username", Value: 1}}, Options: options.Index().SetUnique(true).SetSparse(true)},
		},
		// Просроченные коды вычищает сама Mongo (TTL); пара email+purpose уникальна — на неё опирается Upsert.
		"verification_codes": {
			{Keys: bson.D{{Key: "expiresAt", Value: 1}}, Options: options.Index().SetExpireAfterSeconds(0)},
			{Keys: bson.D{{Key: "email", Value: 1}, {Key: "purpose", Value: 1}}, Options: options.Index().SetUnique(true)},
		},
		// Списки идут в рамках пользователя и сортируются — индексы покрывают и фильтр, и сортировку.
		"projects": {
			byUser(),
			byUser(bson.E{Key: "updatedAt", Value: -1}),
			byUser(bson.E{Key: "status", Value: 1}, bson.E{Key: "updatedAt", Value: -1}),
		},
		"folders": {byUser(), byUser(bson.E{Key: "createdAt", Value: 1})},
		"layouts": {byUser(), byUser(bson.E{Key: "updatedAt", Value: -1})},
	}
}

// dropLegacyIndexes удаляет индексы прошлых версий, у которых изменились параметры:
// прежний users.email_1 не был разреженным и не пускал второго пользователя без почты.
func dropLegacyIndexes(ctx context.Context, db *mongo.Database) error {
	users := db.Collection("users")
	cursor, err := users.Indexes().List(ctx)
	if err != nil {
		return fmt.Errorf("list users indexes: %w", err)
	}
	var specs []struct {
		Name   string `bson:"name"`
		Sparse bool   `bson:"sparse"`
	}
	if err := cursor.All(ctx, &specs); err != nil {
		return fmt.Errorf("decode users indexes: %w", err)
	}
	for _, spec := range specs {
		if spec.Name == "email_1" && !spec.Sparse {
			if _, err := users.Indexes().DropOne(ctx, spec.Name); err != nil {
				return fmt.Errorf("drop legacy index %s: %w", spec.Name, err)
			}
		}
	}
	return nil
}
