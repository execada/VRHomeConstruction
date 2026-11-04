package services

import (
	"encoding/json"
	"errors"
	"math"
	"reflect"
	"strings"
	"testing"

	"github.com/execada/VRHomeConstruction/backend/internal/models"
	"go.mongodb.org/mongo-driver/bson/primitive"
)

// validScene — типичный документ сцены, как его присылает фронтенд
// (включая поля, о которых бэкенд ничего не знает, например materials).
func validScene() map[string]interface{} {
	return map[string]interface{}{
		"schemaVersion": 1.0,
		"dimensions":    map[string]interface{}{"width": 5.5, "height": 2.7, "depth": 4.0},
		"colors":        map[string]interface{}{"walls": "#c0b0a0", "floor": "#e8e0d0", "ceiling": "#ffffff"},
		"materials":     map[string]interface{}{"walls": "plaster", "floor": "oak", "ceiling": "color"},
		"light":         map[string]interface{}{"intensity": 1.2, "ambientIntensity": 0.4, "color": "#ffffff"},
		"openings": []interface{}{
			map[string]interface{}{"id": "o1", "wallId": "north", "type": "window", "position": []interface{}{0.5, 1.2}, "width": 1.2, "height": 1.4},
		},
		"partitions": []interface{}{
			map[string]interface{}{
				"id": "p1", "position": []interface{}{0.0, 0.0, 1.0}, "size": []interface{}{2.0, 2.5, 0.1},
				"color": nil, "openings": []interface{}{},
			},
		},
		"furniture": []interface{}{
			map[string]interface{}{"id": "f1", "name": "Диван", "modelPath": "/models/sofa.glb", "scale": 1.0, "locked": true},
		},
	}
}

// sceneV3 — документ сцены v3: конструкция внешних стен, материалы внутренних стен,
// двери в проёмах и названия помещений.
func sceneV3() map[string]interface{} {
	wall := map[string]interface{}{"thickness": 0.25, "material": "brick"}
	door := map[string]interface{}{"style": "panel", "hinge": "start", "swing": "front", "open": false, "color": "#efe9df"}
	opening := map[string]interface{}{"id": "d1", "wallId": "p1", "type": "door", "position": []interface{}{0.0, 1.05}, "width": 0.9, "height": 2.1, "door": door}
	return map[string]interface{}{
		"schemaVersion": 3.0,
		"dimensions":    map[string]interface{}{"width": 12.0, "height": 2.8, "depth": 12.5},
		"outerWalls":    map[string]interface{}{"front": wall, "back": wall, "left": wall, "right": wall},
		"partitions": []interface{}{map[string]interface{}{
			"id": "p1", "position": []interface{}{0.0, 1.4, 0.0}, "rotation": []interface{}{0.0, 0.0, 0.0},
			"size": []interface{}{4.0, 2.8, 0.1}, "material": "drywall", "openings": []interface{}{opening},
		}},
		"rooms": []interface{}{map[string]interface{}{"id": "r1", "name": "Лоджия", "anchor": []interface{}{1.0, 5.5}, "kind": "loggia"}},
	}
}

// nestedObject строит документ из levels вложенных объектов (корень — уровень 1).
func nestedObject(levels int) map[string]interface{} {
	root := map[string]interface{}{}
	cur := root
	for i := 1; i < levels; i++ {
		next := map[string]interface{}{}
		cur["a"] = next
		cur = next
	}
	cur["leaf"] = 1.0
	return root
}

// nestedArrays строит корневой объект с массивами, вложенными на levels-1 уровней.
func nestedArrays(levels int) map[string]interface{} {
	var inner interface{} = 1.0
	for i := 1; i < levels; i++ {
		inner = []interface{}{inner}
	}
	return map[string]interface{}{"a": inner}
}

func items(n int) []interface{} {
	out := make([]interface{}, n)
	for i := range out {
		out[i] = map[string]interface{}{"id": "x"}
	}
	return out
}

func assertRoomDataErr(t *testing.T, v interface{}, wantInReason string) {
	t.Helper()
	_, err := validateRoomData(v)
	if !errors.Is(err, ErrInvalidRoomData) {
		t.Fatalf("expected ErrInvalidRoomData, got %v", err)
	}
	if !IsValidationError(err) {
		t.Fatalf("expected validation error type, got %T", err)
	}
	if wantInReason != "" && !strings.Contains(err.Error(), wantInReason) {
		t.Fatalf("expected reason to contain %q, got %q", wantInReason, err.Error())
	}
}

func TestValidateRoomDataAcceptsValidDocuments(t *testing.T) {
	docs := map[string]interface{}{
		"typical scene":        validScene(),
		"empty object":         map[string]interface{}{},
		"default room":         defaultRoomData(),
		"without dimensions":   map[string]interface{}{"furniture": []interface{}{}},
		"bson map type":        primitive.M{"furniture": primitive.A{primitive.M{"id": "f1"}}},
		"integer dimensions":   map[string]interface{}{"dimensions": map[string]interface{}{"width": 4, "depth": int32(4), "height": int64(3)}},
		"json number dims":     map[string]interface{}{"dimensions": map[string]interface{}{"width": json.Number("4"), "depth": float32(4), "height": 3.0}},
		"boundary dimensions":  map[string]interface{}{"dimensions": map[string]interface{}{"width": 1.0, "depth": 50.0, "height": 1.5}},
		"boundary dimensions2": map[string]interface{}{"dimensions": map[string]interface{}{"width": 50.0, "depth": 1.0, "height": 10.0}},
		"max depth objects":    nestedObject(roomDataMaxDepth),
		"max depth arrays":     nestedArrays(roomDataMaxDepth),
		"max string":           map[string]interface{}{"s": strings.Repeat("a", roomDataMaxStringLen)},
		"max cyrillic string":  map[string]interface{}{"s": strings.Repeat("ё", roomDataMaxStringLen)},
		"max furniture":        map[string]interface{}{"furniture": items(maxFurnitureItems)},
		"max partitions":       map[string]interface{}{"partitions": items(maxPartitionItems)},
		"max openings":         map[string]interface{}{"openings": items(maxOpeningItems)},
		"max rooms":            map[string]interface{}{"rooms": items(maxRoomLabelItems)},
		"scene v3":             sceneV3(),
	}
	for name, doc := range docs {
		t.Run(name, func(t *testing.T) {
			got, err := validateRoomData(doc)
			if err != nil {
				t.Fatalf("expected valid, got %v", err)
			}
			if got == nil {
				t.Fatal("expected the validated document to be returned")
			}
		})
	}
}

func TestValidateRoomDataPreservesUnknownFields(t *testing.T) {
	doc, err := validateRoomData(validScene())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if _, ok := doc["materials"]; !ok {
		t.Fatal("unknown fields such as materials must be preserved")
	}
}

func TestValidateRoomDataRejectsNonObjects(t *testing.T) {
	for name, v := range map[string]interface{}{
		"nil":    nil,
		"array":  []interface{}{1.0},
		"string": "room",
		"number": 4.0,
		"bool":   true,
	} {
		t.Run(name, func(t *testing.T) {
			assertRoomDataErr(t, v, "must be a JSON object")
		})
	}
}

func TestValidateRequiredRoomData(t *testing.T) {
	_, err := validateRequiredRoomData(nil)
	if !errors.Is(err, ErrInvalidRoomData) || !strings.Contains(err.Error(), "required") {
		t.Fatalf("expected 'roomData is required', got %v", err)
	}
	if _, err := validateRequiredRoomData(validScene()); err != nil {
		t.Fatalf("expected valid scene to pass, got %v", err)
	}
}

func TestValidateRoomDataDepth(t *testing.T) {
	assertRoomDataErr(t, nestedObject(roomDataMaxDepth+1), "nested too deeply")
	assertRoomDataErr(t, nestedArrays(roomDataMaxDepth+1), "nested too deeply")
}

func TestValidateRoomDataSize(t *testing.T) {
	chunk := strings.Repeat("x", 2000)
	big := make([]interface{}, 1100) // ~2.2 MB в JSON
	for i := range big {
		big[i] = chunk
	}
	assertRoomDataErr(t, map[string]interface{}{"extra": big}, "too large")

	fits := make([]interface{}, 1000) // ~2.0 MB — ещё в пределах лимита
	for i := range fits {
		fits[i] = chunk
	}
	if _, err := validateRoomData(map[string]interface{}{"extra": fits}); err != nil {
		t.Fatalf("document under the size limit must pass, got %v", err)
	}
}

func TestValidateRoomDataDimensions(t *testing.T) {
	dims := func(w, h, d interface{}) map[string]interface{} {
		return map[string]interface{}{"dimensions": map[string]interface{}{"width": w, "height": h, "depth": d}}
	}
	cases := map[string]struct {
		doc  map[string]interface{}
		want string
	}{
		"width too small":    {dims(0.99, 3.0, 4.0), "dimensions.width"},
		"width too large":    {dims(50.01, 3.0, 4.0), "dimensions.width"},
		"depth too small":    {dims(4.0, 3.0, 0.5), "dimensions.depth"},
		"depth too large":    {dims(4.0, 3.0, 51.0), "dimensions.depth"},
		"height too small":   {dims(4.0, 1.49, 4.0), "dimensions.height"},
		"height too large":   {dims(4.0, 10.01, 4.0), "dimensions.height"},
		"width not a number": {dims("4", 3.0, 4.0), "dimensions.width"},
		"height is NaN":      {dims(4.0, math.NaN(), 4.0), "dimensions.height"},
		"depth is +Inf":      {dims(4.0, 3.0, math.Inf(1)), "dimensions.depth"},
		"bad json number":    {dims(json.Number("abc"), 3.0, 4.0), "dimensions.width"},
		"missing depth": {map[string]interface{}{
			"dimensions": map[string]interface{}{"width": 4.0, "height": 3.0},
		}, "dimensions.depth"},
		"dimensions not object": {map[string]interface{}{"dimensions": []interface{}{4.0}}, "dimensions must be an object"},
		"dimensions null":       {map[string]interface{}{"dimensions": nil}, "dimensions must be an object"},
	}
	for name, tc := range cases {
		t.Run(name, func(t *testing.T) {
			assertRoomDataErr(t, tc.doc, tc.want)
		})
	}
}

func TestValidateRoomDataArrayCaps(t *testing.T) {
	cases := map[string]struct {
		doc  map[string]interface{}
		want string
	}{
		"too much furniture":  {map[string]interface{}{"furniture": items(maxFurnitureItems + 1)}, "furniture must contain at most 500"},
		"too many partitions": {map[string]interface{}{"partitions": items(maxPartitionItems + 1)}, "partitions must contain at most 100"},
		"too many openings":   {map[string]interface{}{"openings": items(maxOpeningItems + 1)}, "openings must contain at most 300"},
		"too many rooms":      {map[string]interface{}{"rooms": items(maxRoomLabelItems + 1)}, "rooms must contain at most 100"},
		"rooms object":        {map[string]interface{}{"rooms": map[string]interface{}{}}, "rooms must be an array"},
		"bson array over cap": {map[string]interface{}{"furniture": primitive.A(items(maxFurnitureItems + 1))}, "furniture"},
		"furniture object":    {map[string]interface{}{"furniture": map[string]interface{}{}}, "furniture must be an array"},
		"openings null":       {map[string]interface{}{"openings": nil}, "openings must be an array"},
	}
	for name, tc := range cases {
		t.Run(name, func(t *testing.T) {
			assertRoomDataErr(t, tc.doc, tc.want)
		})
	}
}

func TestValidateRoomDataStrings(t *testing.T) {
	long := strings.Repeat("a", roomDataMaxStringLen+1)

	doc := validScene()
	doc["furniture"] = []interface{}{
		map[string]interface{}{"id": "f1"},
		map[string]interface{}{"id": "f2", "name": long},
	}
	assertRoomDataErr(t, doc, "roomData.furniture[1].name")

	assertRoomDataErr(t, map[string]interface{}{"s": strings.Repeat("ё", roomDataMaxStringLen+1)}, "too long")
	assertRoomDataErr(t, map[string]interface{}{"list": []interface{}{"ok", long}}, "roomData.list[1]")
	assertRoomDataErr(t, map[string]interface{}{long: 1.0}, "key is too long")
}

func TestValidateRoomDataErrorPathIsBounded(t *testing.T) {
	longKey := strings.Repeat("k", roomDataMaxStringLen)
	doc := map[string]interface{}{longKey: map[string]interface{}{"v": strings.Repeat("a", roomDataMaxStringLen+1)}}
	_, err := validateRoomData(doc)
	if err == nil {
		t.Fatal("expected an error")
	}
	if len(err.Error()) > 512 {
		t.Fatalf("error message should stay short, got %d bytes", len(err.Error()))
	}
}

func TestValidateRoomDataRejectsUnsupportedValues(t *testing.T) {
	assertRoomDataErr(t, map[string]interface{}{"bad": struct{}{}}, "unsupported value")
	assertRoomDataErr(t, map[string]interface{}{"bad": math.NaN()}, "cannot be encoded")
}

func TestDefaultRoomData(t *testing.T) {
	room := defaultRoomData()

	if room["schemaVersion"] != 1 {
		t.Errorf("expected schemaVersion 1, got %#v", room["schemaVersion"])
	}
	wantDims := map[string]interface{}{"width": 4.0, "height": 3.0, "depth": 4.0}
	if !reflect.DeepEqual(room["dimensions"], wantDims) {
		t.Errorf("unexpected dimensions %#v", room["dimensions"])
	}
	wantColors := map[string]interface{}{"walls": "#c0b0a0", "floor": "#e8e0d0", "ceiling": "#ffffff"}
	if !reflect.DeepEqual(room["colors"], wantColors) {
		t.Errorf("unexpected colors %#v", room["colors"])
	}
	wantLight := map[string]interface{}{"intensity": 1.2, "ambientIntensity": 0.4, "color": "#ffffff"}
	if !reflect.DeepEqual(room["light"], wantLight) {
		t.Errorf("unexpected light %#v", room["light"])
	}
	for _, key := range []string{"openings", "partitions", "furniture"} {
		arr, ok := room[key].([]interface{})
		if !ok || arr == nil || len(arr) != 0 {
			t.Errorf("expected %s to be an empty non-nil array, got %#v", key, room[key])
		}
	}

	// Каждый вызов — новый документ, без общего изменяемого состояния.
	room["colors"].(map[string]interface{})["walls"] = "#000000"
	if defaultRoomData()["colors"].(map[string]interface{})["walls"] != "#c0b0a0" {
		t.Fatal("defaultRoomData must return a fresh document each call")
	}
}

func TestCloneRoomData(t *testing.T) {
	if got, err := cloneRoomData(nil); err != nil || got != nil {
		t.Fatalf("nil document should clone to nil, got %#v (%v)", got, err)
	}

	// Источник в том виде, в каком его отдаёт Mongo-драйвер (primitive.A, int32).
	src := models.RoomData{
		"dimensions": map[string]interface{}{"width": int32(4), "height": 3.0, "depth": 4.0},
		"furniture":  primitive.A{map[string]interface{}{"id": "f1", "position": primitive.A{1.0, 0.0, 2.0}}},
	}
	clone, err := cloneRoomData(src)
	if err != nil {
		t.Fatalf("clone failed: %v", err)
	}
	if _, err := validateRoomData(clone); err != nil {
		t.Fatalf("clone must stay valid, got %v", err)
	}

	clone["furniture"].([]interface{})[0].(map[string]interface{})["id"] = "changed"
	if src["furniture"].(primitive.A)[0].(map[string]interface{})["id"] != "f1" {
		t.Fatal("clone must be a deep copy")
	}

	if _, err := cloneRoomData(models.RoomData{"bad": math.Inf(1)}); err == nil {
		t.Fatal("expected an error for values that cannot be encoded")
	}
}
