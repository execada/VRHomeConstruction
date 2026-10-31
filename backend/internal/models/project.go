package models

import (
	"encoding/json"
	"time"
)

// RoomData — документ сцены, формат которого принадлежит фронтенду.
// Бэкенд хранит его как есть (после проверки в services.validateRoomData) и не
// теряет поля, о которых не знает. Старые документы с типизированной схемой
// (dimensions/colors/light/openings/partitions/furniture) читаются без миграции.
type RoomData = map[string]interface{}

type Project struct {
	ID          string    `json:"_id" bson:"_id"`
	Name        string    `json:"name" bson:"name"`
	Description string    `json:"description" bson:"description"`
	Tags        []string  `json:"tags" bson:"tags"`
	Favorite    bool      `json:"favorite" bson:"favorite"`
	Thumbnail   string    `json:"thumbnail" bson:"thumbnail"` // data URL превью или ""
	Template    *string   `json:"template,omitempty" bson:"template,omitempty"`
	Number      *int      `json:"number,omitempty" bson:"number,omitempty"`
	CreatedAt   time.Time `json:"createdAt" bson:"createdAt"`
	UpdatedAt   time.Time `json:"updatedAt" bson:"updatedAt"`
	UserID      string    `json:"userId" bson:"userId"`
	Status      string    `json:"status" bson:"status"`
	// В списке проектов roomData не выбирается из БД (проекция) и опускается в JSON.
	RoomData       RoomData  `json:"roomData,omitempty" bson:"roomData,omitempty"`
	PlayerPosition []float64 `json:"playerPosition,omitempty" bson:"playerPosition,omitempty"`
	PlayerRotation []float64 `json:"playerRotation,omitempty" bson:"playerRotation,omitempty"`
}

// MarshalJSON гарантирует "tags": [] вместо null (у старых документов поля нет).
func (p Project) MarshalJSON() ([]byte, error) {
	type plain Project // без методов — иначе бесконечная рекурсия
	out := plain(p)
	if out.Tags == nil {
		out.Tags = []string{}
	}
	return json.Marshal(out)
}

// CreateProjectRequest — тело POST /api/projects. Без roomData создаётся комната по умолчанию.
type CreateProjectRequest struct {
	Name        string      `json:"name"`
	Template    *string     `json:"template,omitempty"`
	Status      string      `json:"status"`
	RoomData    interface{} `json:"roomData"`
	Description string      `json:"description"`
	Tags        []string    `json:"tags"`
}

// UpdateProjectRequest — тело PUT /api/projects/:id (полное сохранение сцены).
// Thumbnail: nil — оставить текущее превью, "" — удалить, data URL — заменить.
// Номер проекта клиент не задаёт: его выдаёт атомарный счётчик при создании.
type UpdateProjectRequest struct {
	Name           string      `json:"name"`
	Template       *string     `json:"template,omitempty"`
	Status         string      `json:"status"`
	RoomData       interface{} `json:"roomData"`
	PlayerPosition []float64   `json:"playerPosition,omitempty"`
	PlayerRotation []float64   `json:"playerRotation,omitempty"`
	Thumbnail      *string     `json:"thumbnail,omitempty"`
}

// PatchProjectRequest — тело PATCH /api/projects/:id: меняются только переданные поля.
type PatchProjectRequest struct {
	Name        *string   `json:"name,omitempty"`
	Description *string   `json:"description,omitempty"`
	Tags        *[]string `json:"tags,omitempty"`
	Favorite    *bool     `json:"favorite,omitempty"`
	Thumbnail   *string   `json:"thumbnail,omitempty"`
	Status      *string   `json:"status,omitempty"`
}
