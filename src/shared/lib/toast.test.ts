import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { subscribeToasts, toast, type ToastItem } from './toast';

describe('toast', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('window', { setTimeout: globalThis.setTimeout });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('подписчик сразу получает текущий список и все изменения', () => {
    const seen: ToastItem[][] = [];
    const unsubscribe = subscribeToasts((items) => seen.push(items));
    toast.success('Сохранено');
    toast.error('Ошибка');
    toast.info('Подсказка');
    expect(seen[seen.length - 1]?.map((t: ToastItem) => `${t.type}:${t.message}`)).toEqual(['success:Сохранено', 'error:Ошибка', 'info:Подсказка']);
    unsubscribe();
    vi.runAllTimers();
  });

  it('уведомления исчезают сами; ошибки висят дольше', () => {
    let current: ToastItem[] = [];
    const unsubscribe = subscribeToasts((items) => (current = items));
    toast.info('Коротко');
    toast.error('Долго');
    vi.advanceTimersByTime(3600);
    expect(current.map((t) => t.message)).toEqual(['Долго']);
    vi.advanceTimersByTime(2000);
    expect(current).toEqual([]);
    unsubscribe();
  });

  it('одинаковое сообщение на экране не повторяется', () => {
    let current: ToastItem[] = [];
    const unsubscribe = subscribeToasts((items) => (current = items));
    toast.info('Сессия завершена — войдите снова', 6000);
    toast.error('Сессия завершена — войдите снова');
    toast.error('Не удалось удалить проект');
    expect(current.map((t) => `${t.type}:${t.message}`)).toEqual(['info:Сессия завершена — войдите снова', 'error:Не удалось удалить проект']);

    vi.advanceTimersByTime(6100);
    expect(current).toEqual([]);
    toast.info('Сессия завершена — войдите снова');
    expect(current.map((t) => t.message)).toEqual(['Сессия завершена — войдите снова']);
    unsubscribe();
    vi.runAllTimers();
  });

  it('уведомлению можно задать время показа', () => {
    let current: ToastItem[] = [];
    const unsubscribe = subscribeToasts((items) => (current = items));
    toast.info('Дольше обычного', 6000);
    vi.advanceTimersByTime(5000);
    expect(current.map((t) => t.message)).toEqual(['Дольше обычного']);
    vi.advanceTimersByTime(1100);
    expect(current).toEqual([]);
    unsubscribe();
  });

  it('ручное закрытие и отписка', () => {
    let current: ToastItem[] = [];
    let calls = 0;
    const unsubscribe = subscribeToasts((items) => {
      current = items;
      calls += 1;
    });
    toast.success('A');
    toast.dismiss(current[0].id);
    expect(current).toEqual([]);
    unsubscribe();
    const before = calls;
    toast.info('B');
    expect(calls).toBe(before);
    vi.runAllTimers();
  });
});
