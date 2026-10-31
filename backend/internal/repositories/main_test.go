package repositories

import (
	"context"
	"fmt"
	"log"
	"os"
	"testing"
	"time"

	"github.com/execada/VRHomeConstruction/backend/internal/database"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

// Интеграционные тесты репозиториев идут на настоящей MongoDB (MONGO_TEST_URI,
// по умолчанию локальная) в отдельной временной базе, которая удаляется в конце.
// Без MongoDB тесты пропускаются, а не падают.
const defaultTestURI = "mongodb://localhost:27017"

var testDB *mongo.Database

func TestMain(m *testing.M) {
	client := connectTestMongo()
	if client != nil {
		testDB = client.Database(fmt.Sprintf("vrhc_test_%d", time.Now().UnixNano()))
		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		err := database.EnsureIndexes(ctx, testDB)
		cancel()
		if err != nil {
			log.Fatalf("ensure test indexes: %v", err)
		}
	}

	code := m.Run()

	if client != nil {
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		if err := testDB.Drop(ctx); err != nil {
			log.Printf("drop test database: %v", err)
		}
		_ = client.Disconnect(ctx)
		cancel()
	}
	os.Exit(code)
}

func connectTestMongo() *mongo.Client {
	uri := os.Getenv("MONGO_TEST_URI")
	if uri == "" {
		uri = defaultTestURI
	}
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	client, err := mongo.Connect(ctx, options.Client().ApplyURI(uri).SetServerSelectionTimeout(2*time.Second))
	if err != nil {
		return nil
	}
	if err := client.Ping(ctx, nil); err != nil {
		_ = client.Disconnect(context.Background())
		return nil
	}
	return client
}

// requireDB пропускает тест без MongoDB и очищает коллекции перед ним.
func requireDB(t *testing.T, collections ...string) context.Context {
	t.Helper()
	if testDB == nil {
		t.Skip("MongoDB is not available (set MONGO_TEST_URI)")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	t.Cleanup(cancel)
	for _, name := range collections {
		if _, err := testDB.Collection(name).DeleteMany(ctx, map[string]interface{}{}); err != nil {
			t.Fatalf("clean %s: %v", name, err)
		}
	}
	return ctx
}
