package handlers

import (
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/execada/VRHomeConstruction/backend/internal/auth"
	"github.com/execada/VRHomeConstruction/backend/internal/middleware"
	"github.com/execada/VRHomeConstruction/backend/internal/models"
	"github.com/execada/VRHomeConstruction/backend/internal/services"
	"github.com/gin-gonic/gin"
	"golang.org/x/crypto/bcrypt"
)

const (
	testBodyLimit = 1 << 10
	ownerID       = "owner"
)

// newEngine собирает роутер как в main.go (лимит тела), подставляя userId вместо JWT.
func newEngine(userID string) *gin.Engine {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.Use(middleware.BodyLimit(testBodyLimit))
	r.Use(func(c *gin.Context) {
		c.Set(middleware.ContextUserIDKey, userID)
		c.Next()
	})
	return r
}

func projectEngine(userID string, repo *memProjectRepo) *gin.Engine {
	r := newEngine(userID)
	h := NewProjectHandler(services.NewProjectService(repo))
	r.GET("/projects", h.List)
	r.GET("/projects/:id", h.GetByID)
	r.POST("/projects", h.Create)
	r.PUT("/projects/:id", h.Update)
	r.PATCH("/projects/:id", h.Patch)
	r.POST("/projects/:id/duplicate", h.Duplicate)
	r.DELETE("/projects/:id", h.Delete)
	return r
}

func do(r http.Handler, method, path, body string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	return w
}

func decode(t *testing.T, w *httptest.ResponseRecorder) map[string]interface{} {
	t.Helper()
	var out map[string]interface{}
	if err := json.Unmarshal(w.Body.Bytes(), &out); err != nil {
		t.Fatalf("response is not a JSON object: %q", w.Body.String())
	}
	return out
}

func expectError(t *testing.T, w *httptest.ResponseRecorder, status int, message string) {
	t.Helper()
	if w.Code != status {
		t.Fatalf("expected %d, got %d: %s", status, w.Code, w.Body.String())
	}
	if got := decode(t, w)["error"]; got != message {
		t.Fatalf("expected error %q, got %q", message, got)
	}
}

func storedProject(id, owner string) *models.Project {
	n := 1
	return &models.Project{
		ID: id, Name: "Гостиная", UserID: owner, Status: "active", Number: &n,
		RoomData:  models.RoomData{"dimensions": map[string]interface{}{"width": 4.0, "height": 3.0, "depth": 4.0}},
		CreatedAt: time.Now(), UpdatedAt: time.Now(),
	}
}

func TestProjectCreateReturnsDefaults(t *testing.T) {
	r := projectEngine(ownerID, newMemProjectRepo())

	w := do(r, http.MethodPost, "/projects", `{"name":"  Кухня  "}`)
	if w.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d: %s", w.Code, w.Body.String())
	}
	body := decode(t, w)
	room, _ := body["roomData"].(map[string]interface{})
	if body["name"] != "Кухня" || room["schemaVersion"] != 1.0 {
		t.Fatalf("unexpected project %v", body)
	}
	if tags, ok := body["tags"].([]interface{}); !ok || len(tags) != 0 {
		t.Fatalf("tags must be [], got %#v", body["tags"])
	}
	if body["favorite"] != false || body["description"] != "" || body["thumbnail"] != "" {
		t.Fatalf("unexpected metadata defaults %v", body)
	}
}

func TestProjectValidationErrorsReturn400(t *testing.T) {
	r := projectEngine(ownerID, newMemProjectRepo(storedProject("p1", ownerID)))

	w := do(r, http.MethodPatch, "/projects/p1", `{"tags":["1","2","3","4","5","6","7","8","9","10","11"]}`)
	expectError(t, w, http.StatusBadRequest, "tags must contain at most 10 items")

	w = do(r, http.MethodPut, "/projects/p1", `{"name":"A","status":"active","roomData":{"dimensions":{"width":100,"height":3,"depth":4}}}`)
	expectError(t, w, http.StatusBadRequest, "roomData.dimensions.width must be a number between 1 and 50")

	w = do(r, http.MethodPut, "/projects/p1", `{"name":"A","status":"active","roomData":[1,2]}`)
	expectError(t, w, http.StatusBadRequest, "roomData must be a JSON object")

	w = do(r, http.MethodPost, "/projects", ``)
	expectError(t, w, http.StatusBadRequest, "request body is required")

	if w = do(r, http.MethodPost, "/projects", `{"name":`); w.Code != http.StatusBadRequest {
		t.Fatalf("malformed JSON must be 400, got %d", w.Code)
	}
}

func TestProjectForeignOrMissingReturns404(t *testing.T) {
	r := projectEngine("intruder", newMemProjectRepo(storedProject("p1", ownerID)))

	for _, tc := range []struct{ method, path, body string }{
		{http.MethodGet, "/projects/p1", ""},
		{http.MethodPatch, "/projects/p1", `{"favorite":true}`},
		{http.MethodPost, "/projects/p1/duplicate", ""},
		{http.MethodDelete, "/projects/p1", ""},
		{http.MethodGet, "/projects/missing", ""},
	} {
		w := do(r, tc.method, tc.path, tc.body)
		expectError(t, w, http.StatusNotFound, "project not found")
	}
}

func TestProjectInternalErrorsAreSanitized(t *testing.T) {
	repo := newMemProjectRepo(storedProject("p1", ownerID))
	repo.err = errors.New("mongo: connection refused to secret-host:27017")
	r := projectEngine(ownerID, repo)

	for _, tc := range []struct{ method, path, body string }{
		{http.MethodGet, "/projects", ""},
		{http.MethodGet, "/projects/p1", ""},
		{http.MethodPost, "/projects", `{"name":"A"}`},
	} {
		w := do(r, tc.method, tc.path, tc.body)
		expectError(t, w, http.StatusInternalServerError, "internal server error")
		if strings.Contains(w.Body.String(), "secret-host") {
			t.Fatal("internal error details leaked to the client")
		}
	}
}

func TestOversizedBodyReturns413(t *testing.T) {
	r := projectEngine(ownerID, newMemProjectRepo(storedProject("p1", ownerID)))
	big := `{"name":"A","status":"active","roomData":{"s":"` + strings.Repeat("x", testBodyLimit) + `"}}`

	w := do(r, http.MethodPut, "/projects/p1", big)
	expectError(t, w, http.StatusRequestEntityTooLarge, "request body too large")

	// Без Content-Length (chunked) лимит срабатывает при чтении тела в обработчике.
	req := httptest.NewRequest(http.MethodPut, "/projects/p1", strings.NewReader(big))
	req.ContentLength = -1
	w = httptest.NewRecorder()
	r.ServeHTTP(w, req)
	expectError(t, w, http.StatusRequestEntityTooLarge, "request body too large")
}

func TestProjectListShapeAndPagination(t *testing.T) {
	r := projectEngine(ownerID, newMemProjectRepo(storedProject("p1", ownerID), storedProject("p2", "other")))

	w := do(r, http.MethodGet, "/projects?limit=1000&page=0", "")
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
	body := decode(t, w)
	if body["limit"] != 100.0 || body["page"] != 1.0 || body["total"] != 1.0 || body["pages"] != 1.0 {
		t.Fatalf("unexpected pagination %v", body)
	}
	items := body["data"].([]interface{})
	item := items[0].(map[string]interface{})
	if _, has := item["roomData"]; has {
		t.Fatal("list items must not contain roomData")
	}
	for _, field := range []string{"thumbnail", "favorite", "description", "tags"} {
		if _, has := item[field]; !has {
			t.Errorf("list item must contain %q", field)
		}
	}

	for query, want := range map[string]float64{"?limit=abc": 20, "?limit=0": 1, "": 20, "?limit=50": 50} {
		if got := decode(t, do(r, http.MethodGet, "/projects"+query, ""))["limit"]; got != want {
			t.Errorf("%q: expected limit %v, got %v", query, want, got)
		}
	}

	empty := decode(t, do(projectEngine("nobody", newMemProjectRepo()), http.MethodGet, "/projects", ""))
	if data, ok := empty["data"].([]interface{}); !ok || len(data) != 0 {
		t.Fatalf("empty list must be [], got %#v", empty["data"])
	}
}

func TestProjectPatchDuplicateAndDelete(t *testing.T) {
	repo := newMemProjectRepo(storedProject("p1", ownerID))
	r := projectEngine(ownerID, repo)

	w := do(r, http.MethodPatch, "/projects/p1", `{"favorite":true,"description":"  Светлая  "}`)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	if body := decode(t, w); body["favorite"] != true || body["description"] != "Светлая" {
		t.Fatalf("unexpected patched project %v", body)
	}

	w = do(r, http.MethodPost, "/projects/p1/duplicate", "")
	if w.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d: %s", w.Code, w.Body.String())
	}
	if body := decode(t, w); body["name"] != "Гостиная (копия)" || body["_id"] == "p1" || body["favorite"] != false {
		t.Fatalf("unexpected duplicate %v", body)
	}

	if w = do(r, http.MethodDelete, "/projects/p1", ""); w.Code != http.StatusOK {
		t.Fatalf("expected 200 on delete, got %d", w.Code)
	}
}

func layoutEngine(userID string, repo *memLayoutRepo) *gin.Engine {
	r := newEngine(userID)
	h := NewLayoutHandler(services.NewLayoutService(repo))
	r.GET("/layouts", h.List)
	r.GET("/layouts/:id", h.GetByID)
	r.POST("/layouts", h.Create)
	r.PUT("/layouts/:id", h.Update)
	r.DELETE("/layouts/:id", h.Delete)
	return r
}

func TestLayoutEndpoints(t *testing.T) {
	repo := &memLayoutRepo{byID: map[string]*models.Layout{}}
	r := layoutEngine(ownerID, repo)

	w := do(r, http.MethodPost, "/layouts", `{"name":"Студия","description":"Шаблон","roomData":{"materials":{"floor":"oak"}}}`)
	if w.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d: %s", w.Code, w.Body.String())
	}
	id := decode(t, w)["_id"].(string)

	full := decode(t, do(r, http.MethodGet, "/layouts/"+id, ""))
	if _, has := full["roomData"]; !has || full["description"] != "Шаблон" {
		t.Fatalf("GET by id must return the full template, got %v", full)
	}

	var list []map[string]interface{}
	if err := json.Unmarshal(do(r, http.MethodGet, "/layouts", "").Body.Bytes(), &list); err != nil || len(list) != 1 {
		t.Fatalf("unexpected list: %v", err)
	}
	if _, has := list[0]["roomData"]; has {
		t.Fatal("layout list must not contain roomData")
	}

	w = do(r, http.MethodPut, "/layouts/"+id, `{"name":"Студия","thumbnail":"data:image/gif;base64,R0lG"}`)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for a bad thumbnail, got %d", w.Code)
	}

	intruder := layoutEngine("intruder", repo)
	expectError(t, do(intruder, http.MethodGet, "/layouts/"+id, ""), http.StatusNotFound, "layout not found")
	expectError(t, do(intruder, http.MethodDelete, "/layouts/"+id, ""), http.StatusNotFound, "layout not found")

	if w := do(r, http.MethodDelete, "/layouts/"+id, ""); w.Code != http.StatusOK {
		t.Fatalf("owner should delete own layout, got %d", w.Code)
	}
}

const testPassword = "secret123"

func authEngine(t *testing.T) (*gin.Engine, *memUserRepo, *memVerificationRepo) {
	t.Helper()
	passwordHash, err := bcrypt.GenerateFromPassword([]byte(testPassword), bcrypt.MinCost)
	if err != nil {
		t.Fatalf("bcrypt: %v", err)
	}
	users := &memUserRepo{byID: map[string]*models.User{
		"u1": {ID: "u1", Name: "Old", Email: "old@example.com", PasswordHash: string(passwordHash)},
		"u2": {ID: "u2", Name: "Other", Email: "taken@example.com"},
	}}
	vers := &memVerificationRepo{records: map[string]*models.VerificationRecord{}}
	svc := services.NewAuthService(users, vers, auth.NewTokenService("test-secret", time.Hour), nopSender{})
	h := NewAuthHandler(svc)

	r := newEngine("u1")
	r.GET("/auth/me", h.Me)
	r.PATCH("/auth/me", h.UpdateMe)
	r.POST("/auth/email/send-code", h.SendEmailChangeCode)
	r.POST("/auth/email/verify", h.VerifyEmailChange)
	r.POST("/auth/send-code", h.SendCode)
	r.POST("/auth/verify-code", h.VerifyCode)
	r.POST("/auth/login", h.Login)
	return r, users, vers
}

// setKnownCode подменяет хэш кода в записи, чтобы проверить подтверждение известным кодом.
func setKnownCode(t *testing.T, vers *memVerificationRepo, email, purpose, code string) {
	t.Helper()
	rec := vers.records[verificationKey(email, purpose)]
	if rec == nil {
		t.Fatalf("no verification record for %s/%s", email, purpose)
	}
	knownHash, err := bcrypt.GenerateFromPassword([]byte(code), bcrypt.MinCost)
	if err != nil {
		t.Fatalf("bcrypt: %v", err)
	}
	rec.CodeHash = string(knownHash)
}

func TestProfileEndpoints(t *testing.T) {
	r, users, _ := authEngine(t)

	w := do(r, http.MethodPatch, "/auth/me", `{"name":"  Пётр  "}`)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	if body := decode(t, w); body["id"] != "u1" || body["name"] != "Пётр" || body["email"] != "old@example.com" {
		t.Fatalf("unexpected user %v", body)
	}
	if users.byID["u1"].Name != "Пётр" {
		t.Fatal("name must be persisted")
	}

	expectError(t, do(r, http.MethodPatch, "/auth/me", `{"name":"   "}`), http.StatusBadRequest, "name must be between 1 and 60 characters")
}

func TestEmailChangeEndpoints(t *testing.T) {
	r, users, vers := authEngine(t)

	expectError(t, do(r, http.MethodPost, "/auth/email/send-code", `{"newEmail":"new@example.com","password":"wrong-password"}`),
		http.StatusForbidden, "invalid password")
	expectError(t, do(r, http.MethodPost, "/auth/email/send-code", `{"newEmail":"taken@example.com","password":"secret123"}`),
		http.StatusConflict, "email already registered")
	expectError(t, do(r, http.MethodPost, "/auth/email/send-code", `{"newEmail":"nope","password":"secret123"}`),
		http.StatusBadRequest, "invalid email format")

	w := do(r, http.MethodPost, "/auth/email/send-code", `{"newEmail":"New@Example.com","password":"secret123"}`)
	if w.Code != http.StatusOK || decode(t, w)["message"] == "" {
		t.Fatalf("expected 200 with a message, got %d: %s", w.Code, w.Body.String())
	}
	expectError(t, do(r, http.MethodPost, "/auth/email/send-code", `{"newEmail":"new@example.com","password":"secret123"}`),
		http.StatusTooManyRequests, "code was sent recently, wait 30 seconds before retrying")

	setKnownCode(t, vers, "new@example.com", models.VerificationPurposeChangeEmail, "123456")

	expectError(t, do(r, http.MethodPost, "/auth/email/verify", `{"newEmail":"new@example.com","code":"000000"}`),
		http.StatusUnauthorized, "invalid verification code")
	if w := do(r, http.MethodPost, "/auth/email/verify", `{"newEmail":"new@example.com","code":"12"}`); w.Code != http.StatusBadRequest {
		t.Fatalf("malformed code must be 400 like registration, got %d", w.Code)
	}

	w = do(r, http.MethodPost, "/auth/email/verify", `{"newEmail":"new@example.com","code":"123456"}`)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	user, _ := decode(t, w)["user"].(map[string]interface{})
	if user["email"] != "new@example.com" || users.byID["u1"].Email != "new@example.com" {
		t.Fatalf("expected the email to change, got %v", user)
	}

	expectError(t, do(r, http.MethodPost, "/auth/email/verify", `{"newEmail":"new@example.com","code":"123456"}`),
		http.StatusUnauthorized, "verification code expired, request a new one")
}

func TestRegistrationRequiresRequestToken(t *testing.T) {
	r, users, vers := authEngine(t)

	w := do(r, http.MethodPost, "/auth/send-code", `{"email":"new@example.com","purpose":"register","name":"Иван","password":"secret1"}`)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	token, _ := decode(t, w)["token"].(string)
	if token == "" {
		t.Fatal("send-code must return the request token")
	}
	setKnownCode(t, vers, "new@example.com", models.VerificationPurposeRegister, "123456")

	expectError(t, do(r, http.MethodPost, "/auth/verify-code", `{"email":"new@example.com","code":"123456","purpose":"register"}`),
		http.StatusBadRequest, "invalid field: token")
	expectError(t, do(r, http.MethodPost, "/auth/verify-code", `{"email":"new@example.com","code":"123456","purpose":"register","token":"forged"}`),
		http.StatusUnauthorized, "verification code expired, request a new one")

	body := `{"email":"new@example.com","code":"123456","purpose":"register","token":"` + token + `"}`
	if w := do(r, http.MethodPost, "/auth/verify-code", body); w.Code != http.StatusOK || decode(t, w)["token"] == "" {
		t.Fatalf("expected 200 with a session token, got %d: %s", w.Code, w.Body.String())
	}
	if len(users.byID) != 3 {
		t.Fatal("the account must be created")
	}
	if w := do(r, http.MethodPost, "/auth/login", `{"email":"new@example.com","password":"secret1"}`); w.Code != http.StatusOK {
		t.Fatalf("the new account must accept its password, got %d: %s", w.Code, w.Body.String())
	}
}

func TestBindErrorsHideInternalNames(t *testing.T) {
	r, _, _ := authEngine(t)
	cases := map[string]struct{ path, body, want string }{
		"rule violation": {"/auth/email/verify", `{"newEmail":"a@b.c","code":"12"}`, "invalid field: code"},
		"camel case":     {"/auth/login", `{"password":"x"}`, "invalid field: email"},
		"wrong type":     {"/auth/email/verify", `{"newEmail":"a@b.c","code":123456}`, "invalid JSON body"},
		"broken json":    {"/auth/login", `{"email":`, "invalid JSON body"},
		"empty body":     {"/auth/login", ``, "request body is required"},
	}
	for name, tc := range cases {
		t.Run(name, func(t *testing.T) {
			w := do(r, http.MethodPost, tc.path, tc.body)
			expectError(t, w, http.StatusBadRequest, tc.want)
			if strings.Contains(w.Body.String(), "Request") || strings.Contains(w.Body.String(), "Key:") {
				t.Fatalf("the error must not leak Go type names: %s", w.Body.String())
			}
		})
	}
}

func TestMeUnknownUserReturns401(t *testing.T) {
	r, users, _ := authEngine(t)
	delete(users.byID, "u1")
	expectError(t, do(r, http.MethodGet, "/auth/me", ""), http.StatusUnauthorized, "user not found")
}

func TestAuthErrorMapping(t *testing.T) {
	r, _, _ := authEngine(t)
	register := func(email, name, password string) string {
		return `{"email":"` + email + `","purpose":"register","name":"` + name + `","password":"` + password + `"}`
	}

	expectError(t, do(r, http.MethodPost, "/auth/send-code", register("n@example.com", "", "secret1")),
		http.StatusBadRequest, "name is required")
	expectError(t, do(r, http.MethodPost, "/auth/send-code", register("n@example.com", "N", "123")),
		http.StatusBadRequest, "password must be at least 6 characters")
	expectError(t, do(r, http.MethodPost, "/auth/send-code", register("taken@example.com", "N", "secret1")),
		http.StatusConflict, "email already registered")
	expectError(t, do(r, http.MethodPost, "/auth/send-code", `{"email":"n@example.com","purpose":"login"}`),
		http.StatusBadRequest, "invalid field: purpose")

	wrong := `{"email":"old@example.com","password":"wrong-password"}`
	for i := 0; i < 10; i++ {
		expectError(t, do(r, http.MethodPost, "/auth/login", wrong), http.StatusUnauthorized, "invalid email or password")
	}
	expectError(t, do(r, http.MethodPost, "/auth/login", `{"email":"old@example.com","password":"secret123"}`),
		http.StatusTooManyRequests, "too many login attempts, try again later")
}

func TestMeRequiresUserInContext(t *testing.T) {
	users := &memUserRepo{byID: map[string]*models.User{}}
	vers := &memVerificationRepo{records: map[string]*models.VerificationRecord{}}
	h := NewAuthHandler(services.NewAuthService(users, vers, auth.NewTokenService("test-secret", time.Hour), nopSender{}))
	r := newEngine("")
	r.GET("/auth/me", h.Me)
	expectError(t, do(r, http.MethodGet, "/auth/me", ""), http.StatusUnauthorized, "unauthorized")
}
