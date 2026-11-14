package services

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"log"
	"math/big"
	"strings"
	"sync"
	"time"

	"github.com/execada/VRHomeConstruction/backend/internal/email"
	"github.com/execada/VRHomeConstruction/backend/internal/models"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"golang.org/x/crypto/bcrypt"
)

// checkResendCooldown запрещает повторную отправку кода на тот же адрес чаще resendCooldown
// (защита от спама письмами на чужой адрес).
func (s *AuthService) checkResendCooldown(ctx context.Context, email, purpose string) error {
	existing, err := s.verifications.FindValid(ctx, email, purpose)
	if err != nil {
		return fmt.Errorf("find verification code: %w", err)
	}
	if existing != nil && time.Since(existing.LastSentAt) < resendCooldown {
		return ErrCodeResendTooSoon
	}
	return nil
}

// issueCode генерирует код, сохраняет его хэш в записи pending (поля цели —
// email, purpose и т.д. — заполняет вызывающий) и отправляет письмо в фоне.
func (s *AuthService) issueCode(ctx context.Context, pending models.VerificationRecord, purposeLabel string) (*models.SendCodeResponse, error) {
	code, err := s.storeCode(ctx, pending)
	if err != nil {
		return nil, err
	}
	s.mail.Send(pending.Email, code, purposeLabel)
	if s.sender.LogOnly() {
		return &models.SendCodeResponse{Message: msgCodeInLogs}, nil
	}
	return &models.SendCodeResponse{Message: msgCodeSent}, nil
}

// storeCode генерирует код и сохраняет его хэш в записи pending (новый код заменяет
// прежний и обнуляет попытки). Возвращает сам код — для письма.
func (s *AuthService) storeCode(ctx context.Context, pending models.VerificationRecord) (string, error) {
	code, err := generateCode()
	if err != nil {
		return "", fmt.Errorf("generate code: %w", err)
	}
	codeHash, err := bcrypt.GenerateFromPassword([]byte(code), bcrypt.MinCost)
	if err != nil {
		return "", fmt.Errorf("hash code: %w", err)
	}

	now := time.Now()
	record := pending
	record.ID = primitive.NewObjectID().Hex()
	record.CodeHash = string(codeHash)
	record.ExpiresAt = now.Add(verificationTTL)
	record.LastSentAt = now
	if err := s.verifications.Upsert(ctx, &record); err != nil {
		return "", fmt.Errorf("store verification code: %w", err)
	}
	return code, nil
}

// verifyCode тратит одну попытку и сверяет код. Попытка расходуется атомарно до
// сравнения, поэтому параллельные запросы не получат больше maxCodeAttempts проверок.
func (s *AuthService) verifyCode(ctx context.Context, key models.VerificationKey, code string) (*models.VerificationRecord, error) {
	record, err := s.consumeAttempt(ctx, key)
	if err != nil {
		return nil, err
	}
	if !codeMatches(record, code) {
		return nil, wrongCodeError(record)
	}
	return record, nil
}

// consumeAttempt атомарно списывает попытку у живой записи с ключом key. Если такой
// записи нет — ошибка «попытки исчерпаны» или «кода нет / истёк» (сравнения не было).
func (s *AuthService) consumeAttempt(ctx context.Context, key models.VerificationKey) (*models.VerificationRecord, error) {
	record, err := s.verifications.ConsumeAttempt(ctx, key, maxCodeAttempts)
	if err != nil {
		return nil, fmt.Errorf("consume verification attempt: %w", err)
	}
	if record == nil {
		return nil, s.missingCodeError(ctx, key)
	}
	return record, nil
}

func codeMatches(record *models.VerificationRecord, code string) bool {
	return bcrypt.CompareHashAndPassword([]byte(record.CodeHash), []byte(strings.TrimSpace(code))) == nil
}

// wrongCodeError — ответ на неверный код: последняя попытка аннулирует код.
func wrongCodeError(record *models.VerificationRecord) error {
	if record.Attempts >= maxCodeAttempts {
		return ErrTooManyAttempts
	}
	return ErrInvalidCode
}

// missingCodeError различает «попытки исчерпаны» и «кода нет / истёк / запрошен не вами».
// Исчерпанная запись не удаляется: пока она жива, действует пауза перед новой отправкой.
func (s *AuthService) missingCodeError(ctx context.Context, key models.VerificationKey) error {
	existing, err := s.verifications.FindValid(ctx, key.Email, key.Purpose)
	if err != nil {
		return fmt.Errorf("find verification code: %w", err)
	}
	if existing != nil && existing.Attempts >= maxCodeAttempts && sameRequest(existing, key) {
		return ErrTooManyAttempts
	}
	return ErrCodeExpired
}

func sameRequest(record *models.VerificationRecord, key models.VerificationKey) bool {
	return (key.UserID == "" || record.UserID == key.UserID) && (key.TokenHash == "" || record.TokenHash == key.TokenHash)
}

// discardCode удаляет запись кода. Сбой не прерывает сценарий (запись всё равно
// истечёт по TTL-индексу), но логируется.
func (s *AuthService) discardCode(ctx context.Context, address, purpose string) {
	if err := s.verifications.Delete(ctx, address, purpose); err != nil {
		log.Printf("[AUTH] delete verification code email=%s purpose=%s: %v", email.MaskAddress(address), purpose, err)
	}
}

func generateCode() (string, error) {
	var sb strings.Builder
	for i := 0; i < 6; i++ {
		n, err := rand.Int(rand.Reader, big.NewInt(10))
		if err != nil {
			return "", err
		}
		sb.WriteByte(byte('0' + n.Int64()))
	}
	return sb.String(), nil
}

// newRequestToken — случайный токен заявки (клиенту) и его SHA-256 (в базу).
func newRequestToken() (token, tokenHash string, err error) {
	buf := make([]byte, 32)
	if _, err := rand.Read(buf); err != nil {
		return "", "", fmt.Errorf("generate request token: %w", err)
	}
	token = hex.EncodeToString(buf)
	return token, hashRequestToken(token), nil
}

func hashRequestToken(token string) string {
	sum := sha256.Sum256([]byte(strings.TrimSpace(token)))
	return hex.EncodeToString(sum[:])
}

var (
	dummyHashOnce sync.Once
	dummyHash     []byte
)

// dummyPasswordHash — хэш случайного пароля для сравнения, когда пользователя нет:
// время ответа одинаковое для существующих и несуществующих адресов.
func dummyPasswordHash() []byte {
	dummyHashOnce.Do(func() {
		secret := make([]byte, 32)
		_, _ = rand.Read(secret)
		dummyHash, _ = bcrypt.GenerateFromPassword([]byte(hex.EncodeToString(secret)), bcrypt.DefaultCost)
	})
	return dummyHash
}
