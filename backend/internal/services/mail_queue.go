package services

import (
	"context"
	"log"
	"sync"

	"github.com/execada/VRHomeConstruction/backend/internal/email"
)

// mailQueue отправляет письма с кодами в фоне: не больше concurrency одновременно,
// паника отправителя не роняет процесс, сбои пишутся в лог без кода и полного адреса.
type mailQueue struct {
	sender email.Sender
	slots  chan struct{}
	wg     sync.WaitGroup
}

func newMailQueue(sender email.Sender, concurrency int) *mailQueue {
	return &mailQueue{sender: sender, slots: make(chan struct{}, concurrency)}
}

// Send ставит письмо в отправку. Если все слоты заняты (поток запросов), письмо
// не отправляется — пользователь запросит код повторно после паузы.
func (q *mailQueue) Send(to, code, purposeLabel string) {
	select {
	case q.slots <- struct{}{}:
	default:
		log.Printf("[EMAIL] очередь писем переполнена, код для %s не отправлен", email.MaskAddress(to))
		return
	}

	q.wg.Add(1)
	go func() {
		defer q.wg.Done()
		defer func() { <-q.slots }()
		defer func() {
			if r := recover(); r != nil {
				log.Printf("[EMAIL] сбой отправки для %s: %v", email.MaskAddress(to), r)
			}
		}()
		if err := q.sender.SendVerificationCode(to, code, purposeLabel); err != nil {
			log.Printf("[EMAIL] код для %s не отправлен: %v", email.MaskAddress(to), err)
		}
	}()
}

// Wait ждёт писем, которые ещё отправляются, но не дольше ctx.
func (q *mailQueue) Wait(ctx context.Context) error {
	done := make(chan struct{})
	go func() {
		q.wg.Wait()
		close(done)
	}()
	select {
	case <-done:
		return nil
	case <-ctx.Done():
		return ctx.Err()
	}
}
