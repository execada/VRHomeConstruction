package models

import "time"

// Layout — шаблон комнаты: метаданные + документ сцены, из которого создаются проекты.
type Layout struct {
	ID          string `json:"_id" bson:"_id"`
	Name        string `json:"name" bson:"name"`
	Description string `json:"description" bson:"description"`
	// У старых раскладок roomData нет; в списке раскладок поле не выбирается (проекция).
	RoomData  RoomData  `json:"roomData,omitempty" bson:"roomData,omitempty"`
	Thumbnail string    `json:"thumbnail" bson:"thumbnail"` // data URL превью или ""
	UserID    string    `json:"userId" bson:"userId"`
	CreatedAt time.Time `json:"createdAt" bson:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt" bson:"updatedAt"`
}

// LayoutRequest — тело POST/PUT /api/layouts. Name обязателен; необязательные поля,
// не переданные в PUT, сохраняют текущие значения ("" явно очищает строку).
type LayoutRequest struct {
	Name        string      `json:"name"`
	Description *string     `json:"description,omitempty"`
	RoomData    interface{} `json:"roomData"`
	Thumbnail   *string     `json:"thumbnail,omitempty"`
}

type (
	CreateLayoutRequest = LayoutRequest
	UpdateLayoutRequest = LayoutRequest
)
