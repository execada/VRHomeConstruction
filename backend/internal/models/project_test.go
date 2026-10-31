package models

import (
	"encoding/json"
	"reflect"
	"testing"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
)

func toJSONMap(t *testing.T, v interface{}) map[string]interface{} {
	t.Helper()
	raw, err := json.Marshal(v)
	if err != nil {
		t.Fatalf("marshal failed: %v", err)
	}
	var out map[string]interface{}
	if err := json.Unmarshal(raw, &out); err != nil {
		t.Fatalf("unmarshal failed: %v", err)
	}
	return out
}

func TestProjectJSONTagsNeverNull(t *testing.T) {
	got := toJSONMap(t, Project{ID: "p1"})
	if tags, ok := got["tags"].([]interface{}); !ok || len(tags) != 0 {
		t.Fatalf("nil tags must serialise as [], got %#v", got["tags"])
	}
	if _, has := got["roomData"]; has {
		t.Fatal("missing roomData must be omitted (list items)")
	}
	for _, field := range []string{"description", "thumbnail", "favorite"} {
		if _, has := got[field]; !has {
			t.Errorf("expected %q to always be present", field)
		}
	}

	withTags := toJSONMap(t, &Project{ID: "p1", Tags: []string{"лофт"}, RoomData: RoomData{"a": 1.0}})
	if !reflect.DeepEqual(withTags["tags"], []interface{}{"лофт"}) {
		t.Fatalf("unexpected tags %#v", withTags["tags"])
	}
	if _, has := withTags["roomData"]; !has {
		t.Fatal("present roomData must be serialised")
	}
}

// legacyProjectDoc — проект в старой типизированной схеме roomData (как его писал прежний бэкенд).
func legacyProjectDoc() bson.D {
	now := time.Now().UTC().Truncate(time.Millisecond)
	return bson.D{
		{Key: "_id", Value: "p1"},
		{Key: "name", Value: "Старый проект"},
		{Key: "number", Value: 3},
		{Key: "createdAt", Value: now},
		{Key: "updatedAt", Value: now},
		{Key: "userId", Value: "u1"},
		{Key: "status", Value: "active"},
		{Key: "roomData", Value: bson.D{
			{Key: "dimensions", Value: bson.D{{Key: "width", Value: 4.0}, {Key: "height", Value: 3.0}, {Key: "depth", Value: 4.0}}},
			{Key: "colors", Value: bson.D{{Key: "walls", Value: "#c0b0a0"}, {Key: "floor", Value: "#e8e0d0"}, {Key: "ceiling", Value: "#ffffff"}}},
			{Key: "light", Value: bson.D{{Key: "intensity", Value: 1.2}, {Key: "ambientIntensity", Value: 0.4}, {Key: "color", Value: "#ffffff"}}},
			{Key: "openings", Value: bson.A{bson.D{
				{Key: "id", Value: "o1"}, {Key: "wallId", Value: "north"}, {Key: "type", Value: "window"},
				{Key: "position", Value: bson.A{0.5, 1.2}}, {Key: "width", Value: 1.2}, {Key: "height", Value: 1.4},
			}}},
			{Key: "partitions", Value: bson.A{bson.D{
				{Key: "id", Value: "w1"}, {Key: "position", Value: bson.A{0.0, 0.0, 1.0}}, {Key: "size", Value: bson.A{2.0, 2.5, 0.1}},
				{Key: "openings", Value: bson.A{}},
			}}},
			{Key: "furniture", Value: bson.A{bson.D{
				{Key: "id", Value: "f1"}, {Key: "name", Value: "Диван"}, {Key: "modelPath", Value: "/models/sofa.glb"},
				{Key: "position", Value: bson.A{1.0, 0.0, 1.0}}, {Key: "rotation", Value: bson.A{0.0, 0.0, 0.0}}, {Key: "scale", Value: 1.0},
			}}},
		}},
		{Key: "playerPosition", Value: bson.A{0.0, 1.6, 0.0}},
	}
}

func TestLegacyProjectDocumentDecodes(t *testing.T) {
	raw, err := bson.Marshal(legacyProjectDoc())
	if err != nil {
		t.Fatalf("bson marshal failed: %v", err)
	}
	var p Project
	if err := bson.Unmarshal(raw, &p); err != nil {
		t.Fatalf("legacy document must decode, got %v", err)
	}

	// Вложенные документы — обычные map, а не bson.D (иначе JSON был бы [{Key,Value}]).
	dims, ok := p.RoomData["dimensions"].(map[string]interface{})
	if !ok || dims["width"] != 4.0 {
		t.Fatalf("expected dimensions as a map, got %T %#v", p.RoomData["dimensions"], p.RoomData["dimensions"])
	}
	furniture, ok := p.RoomData["furniture"].(primitive.A)
	if !ok || len(furniture) != 1 {
		t.Fatalf("expected furniture array, got %T", p.RoomData["furniture"])
	}
	if _, ok := furniture[0].(map[string]interface{}); !ok {
		t.Fatalf("array elements must be maps too, got %T", furniture[0])
	}
	if p.Number == nil || *p.Number != 3 || p.Description != "" || p.Favorite || p.Thumbnail != "" {
		t.Fatalf("unexpected decoded metadata %+v", p)
	}

	body := toJSONMap(t, p)
	room := body["roomData"].(map[string]interface{})
	wantDims := map[string]interface{}{"width": 4.0, "height": 3.0, "depth": 4.0}
	if !reflect.DeepEqual(room["dimensions"], wantDims) {
		t.Fatalf("unexpected dimensions JSON %#v", room["dimensions"])
	}
	sofa := room["furniture"].([]interface{})[0].(map[string]interface{})
	if sofa["name"] != "Диван" || !reflect.DeepEqual(sofa["position"], []interface{}{1.0, 0.0, 1.0}) {
		t.Fatalf("unexpected furniture JSON %#v", sofa)
	}
	if tags, ok := body["tags"].([]interface{}); !ok || len(tags) != 0 {
		t.Fatalf("legacy project without tags must serialise tags as [], got %#v", body["tags"])
	}
}

func TestRoomDataKeepsUnknownFieldsThroughBSON(t *testing.T) {
	var scene RoomData
	if err := json.Unmarshal([]byte(`{"schemaVersion":1,"materials":{"floor":"oak"},"furniture":[{"id":"f1","meta":{"tint":"#fff"}}]}`), &scene); err != nil {
		t.Fatalf("unmarshal failed: %v", err)
	}
	raw, err := bson.Marshal(Project{ID: "p1", RoomData: scene})
	if err != nil {
		t.Fatalf("bson marshal failed: %v", err)
	}
	var decoded Project
	if err := bson.Unmarshal(raw, &decoded); err != nil {
		t.Fatalf("bson unmarshal failed: %v", err)
	}

	if got, want := toJSONMap(t, decoded)["roomData"], toJSONMap(t, Project{RoomData: scene})["roomData"]; !reflect.DeepEqual(got, want) {
		t.Fatalf("roomData changed after a BSON round trip:\n got  %#v\n want %#v", got, want)
	}
}

func TestLegacyLayoutDocumentDecodes(t *testing.T) {
	raw, err := bson.Marshal(bson.D{{Key: "_id", Value: "l1"}, {Key: "name", Value: "Старая"}, {Key: "userId", Value: "u1"}})
	if err != nil {
		t.Fatalf("bson marshal failed: %v", err)
	}
	var l Layout
	if err := bson.Unmarshal(raw, &l); err != nil {
		t.Fatalf("legacy layout must decode, got %v", err)
	}
	body := toJSONMap(t, l)
	if body["description"] != "" || body["thumbnail"] != "" {
		t.Fatalf("expected empty description/thumbnail, got %v", body)
	}
	if _, has := body["roomData"]; has {
		t.Fatal("legacy layout without roomData must omit it")
	}
}
