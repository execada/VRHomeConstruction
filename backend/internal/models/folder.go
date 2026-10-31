package models

import "time"

type Folder struct {
	ID             string    `json:"_id" bson:"_id"`
	Name           string    `json:"name" bson:"name"`
	Description    *string   `json:"description,omitempty" bson:"description,omitempty"`
	UserID         string    `json:"userId" bson:"userId"`
	ParentID       *string   `json:"parentId" bson:"parentId"`
	ProjectIDs     []string  `json:"projectIds" bson:"projectIds"`
	LayoutIDs      []string  `json:"layoutIds" bson:"layoutIds"`
	ChildFolderIDs []string  `json:"childFolderIds" bson:"childFolderIds"`
	CreatedAt      time.Time `json:"createdAt" bson:"createdAt"`
	UpdatedAt      time.Time `json:"updatedAt" bson:"updatedAt"`
}

type CreateFolderRequest struct {
	Name        string  `json:"name" binding:"required"`
	Description *string `json:"description,omitempty"`
	ParentID    *string `json:"parentId"`
}

type UpdateFolderRequest struct {
	Name           string   `json:"name" binding:"required"`
	Description    *string  `json:"description,omitempty"`
	ParentID       *string  `json:"parentId"`
	ProjectIDs     []string `json:"projectIds"`
	LayoutIDs      []string `json:"layoutIds"`
	ChildFolderIDs []string `json:"childFolderIds"`
}

type FolderTree struct {
	Folder
	Children []FolderTree `json:"children,omitempty"`
}
