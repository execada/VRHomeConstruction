package services

import (
	"encoding/json"
	"fmt"
	"slices"
	"strconv"
	"strings"
	"unicode/utf8"

	"github.com/execada/VRHomeConstruction/backend/internal/models"
	"go.mongodb.org/mongo-driver/bson/primitive"
)

// Ограничения документа сцены (roomData). Глубина считается по объектам/массивам,
// корневой объект — уровень 1; размер — длина документа в JSON.
//
// Документ v4 — здание из этажей (floors): лимиты массивов и размеры комнаты действуют
// для каждого этажа так же, как для квартиры документа v1–v3 на верхнем уровне.
const (
	roomDataMaxDepth     = 12
	roomDataMaxBytes     = 3 << 20 // здание до пяти этажей (тело запроса — до 4 МБ)
	roomDataMaxStringLen = 2048    // символов в любой строке и ключе (превью в roomData не хранятся)
	maxFurnitureItems    = 500
	maxPartitionItems    = 100
	maxOpeningItems      = 300
	maxRoomLabelItems    = 100 // названия помещений (документ сцены v3)
	maxStairItems        = 8   // лестницы на этаже (документ сцены v4)
	maxFloors            = 5   // этажи здания (документ сцены v4)
	minRoomSide          = 1.0 // ширина и глубина, м
	maxRoomSide          = 50.0
	minRoomHeight        = 1.5
	maxRoomHeight        = 10.0
	minSlabThickness     = 0.15 // толщина перекрытия между этажами, м
	maxSlabThickness     = 0.6
	roomSchemaVersion    = 1
	errorPathSegmentMax  = 64 // длина сегмента пути в тексте ошибки
)

var roomArrayCaps = []struct {
	key string
	max int
}{
	{"furniture", maxFurnitureItems},
	{"partitions", maxPartitionItems},
	{"openings", maxOpeningItems},
	{"rooms", maxRoomLabelItems},
	{"stairs", maxStairItems},
}

var roomDimensionRanges = []struct {
	key      string
	min, max float64
}{
	{"width", minRoomSide, maxRoomSide},
	{"depth", minRoomSide, maxRoomSide},
	{"height", minRoomHeight, maxRoomHeight},
}

func roomDataError(format string, args ...interface{}) error {
	return newValidationError(ErrInvalidRoomData, format, args...)
}

// validateRoomData проверяет документ сцены и возвращает его как RoomData.
// Остальные поля документа не интерпретируются — их формат задаёт фронтенд.
func validateRoomData(v interface{}) (models.RoomData, error) {
	doc, ok := asObject(v)
	if !ok {
		return nil, roomDataError("roomData must be a JSON object")
	}
	if err := checkStorey(doc, "roomData"); err != nil {
		return nil, err
	}
	if err := checkRoomFloors(doc); err != nil {
		return nil, err
	}
	if err := checkSlabThickness(doc); err != nil {
		return nil, err
	}
	if perr := walkValue(doc, 1); perr != nil {
		return nil, roomDataError("%s", perr.Error())
	}
	if err := checkRoomDataSize(doc); err != nil {
		return nil, err
	}
	return doc, nil
}

// validateRequiredRoomData — как validateRoomData, но отсутствие документа тоже ошибка.
func validateRequiredRoomData(v interface{}) (models.RoomData, error) {
	if v == nil {
		return nil, roomDataError("roomData is required")
	}
	return validateRoomData(v)
}

// defaultRoomData — комната нового проекта без присланной сцены (новый документ на каждый вызов).
func defaultRoomData() models.RoomData {
	return models.RoomData{
		"schemaVersion": roomSchemaVersion,
		"dimensions":    map[string]interface{}{"width": 4.0, "height": 3.0, "depth": 4.0},
		"colors":        map[string]interface{}{"walls": "#c0b0a0", "floor": "#e8e0d0", "ceiling": "#ffffff"},
		"light":         map[string]interface{}{"intensity": 1.2, "ambientIntensity": 0.4, "color": "#ffffff"},
		"openings":      []interface{}{},
		"partitions":    []interface{}{},
		"furniture":     []interface{}{},
	}
}

// cloneRoomData — глубокая копия документа в JSON-нормальной форме (map[string]interface{},
// []interface{}, float64, ...): так же выглядят документы из тела запроса, а не из Mongo.
func cloneRoomData(doc models.RoomData) (models.RoomData, error) {
	if doc == nil {
		return nil, nil
	}
	encoded, err := json.Marshal(doc)
	if err != nil {
		return nil, fmt.Errorf("encode roomData: %w", err)
	}
	var clone models.RoomData
	if err := json.Unmarshal(encoded, &clone); err != nil {
		return nil, fmt.Errorf("decode roomData: %w", err)
	}
	return clone, nil
}

// checkStorey проверяет квартиру (документ v1–v3) или этаж документа v4:
// длины массивов и размеры комнаты. path — путь в тексте ошибки.
func checkStorey(doc map[string]interface{}, path string) error {
	if err := checkRoomArrays(doc, path); err != nil {
		return err
	}
	return checkRoomDimensions(doc, path)
}

func checkRoomArrays(doc map[string]interface{}, path string) error {
	for _, rule := range roomArrayCaps {
		raw, present := doc[rule.key]
		if !present {
			continue
		}
		arr, ok := asArray(raw)
		if !ok {
			return roomDataError("%s.%s must be an array", path, rule.key)
		}
		if len(arr) > rule.max {
			return roomDataError("%s.%s must contain at most %d items", path, rule.key, rule.max)
		}
	}
	return nil
}

func checkRoomDimensions(doc map[string]interface{}, path string) error {
	raw, present := doc["dimensions"]
	if !present {
		return nil
	}
	dims, ok := asObject(raw)
	if !ok {
		return roomDataError("%s.dimensions must be an object", path)
	}
	for _, r := range roomDimensionRanges {
		// Отрицание диапазона (а не n < min || n > max), чтобы NaN тоже отклонялся.
		if n, ok := toFloat(dims[r.key]); !ok || !(n >= r.min && n <= r.max) {
			return roomDataError("%s.dimensions.%s must be a number between %g and %g", path, r.key, r.min, r.max)
		}
	}
	return nil
}

// checkRoomFloors проверяет этажи документа v4: от одного до maxFloors объектов,
// у каждого — лимиты массивов (мебель, стены, проёмы, помещения, лестницы) и размеры.
func checkRoomFloors(doc map[string]interface{}) error {
	raw, present := doc["floors"]
	if !present {
		return nil
	}
	floors, ok := asArray(raw)
	if !ok {
		return roomDataError("roomData.floors must be an array")
	}
	if len(floors) == 0 || len(floors) > maxFloors {
		return roomDataError("roomData.floors must contain between 1 and %d floors", maxFloors)
	}
	for i, item := range floors {
		floor, ok := asObject(item)
		if !ok {
			return roomDataError("roomData.floors[%d] must be an object", i)
		}
		if err := checkStorey(floor, fmt.Sprintf("roomData.floors[%d]", i)); err != nil {
			return err
		}
	}
	return nil
}

// checkSlabThickness проверяет толщину перекрытия между этажами (если она задана).
func checkSlabThickness(doc map[string]interface{}) error {
	raw, present := doc["slabThickness"]
	if !present {
		return nil
	}
	if n, ok := toFloat(raw); !ok || !(n >= minSlabThickness && n <= maxSlabThickness) {
		return roomDataError("roomData.slabThickness must be a number between %g and %g", minSlabThickness, maxSlabThickness)
	}
	return nil
}

func checkRoomDataSize(doc map[string]interface{}) error {
	encoded, err := json.Marshal(doc)
	if err != nil {
		return roomDataError("roomData contains values that cannot be encoded as JSON")
	}
	if len(encoded) > roomDataMaxBytes {
		return roomDataError("roomData is too large (max %d MB)", roomDataMaxBytes>>20)
	}
	return nil
}

// asObject/asArray принимают как типы encoding/json, так и типы Mongo-драйвера.
func asObject(v interface{}) (map[string]interface{}, bool) {
	switch obj := v.(type) {
	case map[string]interface{}:
		return obj, true
	case primitive.M:
		return obj, true
	}
	return nil, false
}

func asArray(v interface{}) ([]interface{}, bool) {
	switch arr := v.(type) {
	case []interface{}:
		return arr, true
	case primitive.A:
		return arr, true
	}
	return nil, false
}

func toFloat(v interface{}) (float64, bool) {
	switch n := v.(type) {
	case float64:
		return n, true
	case float32:
		return float64(n), true
	case int:
		return float64(n), true
	case int32:
		return float64(n), true
	case int64:
		return float64(n), true
	case json.Number:
		f, err := n.Float64()
		return f, err == nil
	}
	return 0, false
}

func exceedsRunes(s string, maxRunes int) bool {
	return len(s) > maxRunes && utf8.RuneCountInString(s) > maxRunes
}

// pathSegment — ключ объекта или индекс массива на пути к ошибочному значению.
type pathSegment struct {
	key     string
	index   int
	isIndex bool
}

// pathError — ошибка обхода документа. Путь собирается при раскрутке рекурсии,
// поэтому корректные документы проверяются без лишних аллокаций.
type pathError struct {
	reversed []pathSegment // от ошибочного значения к корню
	reason   string
}

func (e *pathError) within(seg pathSegment) *pathError {
	return &pathError{reversed: append(slices.Clone(e.reversed), seg), reason: e.reason}
}

func (e *pathError) Error() string {
	var b strings.Builder
	b.WriteString("roomData")
	for i := len(e.reversed) - 1; i >= 0; i-- {
		seg := e.reversed[i]
		if seg.isIndex {
			b.WriteString("[" + strconv.Itoa(seg.index) + "]")
			continue
		}
		b.WriteString("." + shortSegment(seg.key))
	}
	return b.String() + ": " + e.reason
}

func shortSegment(key string) string {
	if utf8.RuneCountInString(key) <= errorPathSegmentMax {
		return key
	}
	return truncateRunes(key, errorPathSegmentMax) + "…"
}

func walkValue(v interface{}, depth int) *pathError {
	if obj, ok := asObject(v); ok {
		return walkObject(obj, depth)
	}
	if arr, ok := asArray(v); ok {
		return walkArray(arr, depth)
	}
	switch val := v.(type) {
	case string:
		if exceedsRunes(val, roomDataMaxStringLen) {
			return &pathError{reason: fmt.Sprintf("string is too long (max %d characters)", roomDataMaxStringLen)}
		}
		return nil
	case nil, bool, float64, float32, int, int32, int64, json.Number:
		return nil
	default:
		return &pathError{reason: "unsupported value type"}
	}
}

func depthError() *pathError {
	return &pathError{reason: fmt.Sprintf("nested too deeply (max %d levels)", roomDataMaxDepth)}
}

func walkObject(obj map[string]interface{}, depth int) *pathError {
	if depth > roomDataMaxDepth {
		return depthError()
	}
	for key, child := range obj {
		if exceedsRunes(key, roomDataMaxStringLen) {
			return &pathError{reason: fmt.Sprintf("object key is too long (max %d characters)", roomDataMaxStringLen)}
		}
		if err := walkValue(child, depth+1); err != nil {
			return err.within(pathSegment{key: key})
		}
	}
	return nil
}

func walkArray(arr []interface{}, depth int) *pathError {
	if depth > roomDataMaxDepth {
		return depthError()
	}
	for i, child := range arr {
		if err := walkValue(child, depth+1); err != nil {
			return err.within(pathSegment{index: i, isIndex: true})
		}
	}
	return nil
}
