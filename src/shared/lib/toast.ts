/**
 * Лёгкая система тостов без зависимостей.
 * Любой модуль может вызвать toast.success/error/info; Toaster подписывается и рендерит.
 * @module shared/lib/toast
 */

export type ToastType = 'success' | 'error' | 'info';

export interface ToastItem {
  id: number;
  type: ToastType;
  message: string;
}

type Listener = (toasts: ToastItem[]) => void;

let toasts: ToastItem[] = [];
let listeners: Listener[] = [];

function emit() {
  for (const l of listeners) l(toasts);
}

function dismiss(id: number) {
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}

/**
 * Показать тост. То же сообщение, что уже на экране, не повторяется: несколько ошибок
 * с одной причиной (например, конец сессии) показываются одним тостом.
 */
function push(type: ToastType, message: string, ttl = 3500) {
  if (toasts.some((t) => t.message === message)) return;
  const id = Date.now() + Math.random();
  toasts = [...toasts, { id, type, message }];
  emit();
  window.setTimeout(() => dismiss(id), ttl);
}

export const toast = {
  success: (message: string) => push('success', message),
  error: (message: string) => push('error', message, 5000),
  /**
   * @param message - текст
   * @param ttl - сколько показывать, мс (по умолчанию 3,5 с)
   */
  info: (message: string, ttl?: number) => push('info', message, ttl),
  dismiss,
};

export function subscribeToasts(fn: Listener): () => void {
  listeners.push(fn);
  fn(toasts);
  return () => {
    listeners = listeners.filter((l) => l !== fn);
  };
}
