/**
 * Обратный отсчёт до повторной отправки кода (пауза — как ограничение на сервере).
 * @module user/lib/useCountdown
 */

import { useCallback, useEffect, useState } from 'react';

/** Пауза перед повторной отправкой кода на тот же адрес, с (как на сервере). */
export const RESEND_DELAY_S = 30;

/**
 * Секунды до конца отсчёта и функция, запускающая отсчёт заново (стабильная между рендерами).
 * @param seconds - длительность отсчёта, с
 */
export function useCountdown(seconds: number = RESEND_DELAY_S): [number, () => void] {
  const [left, setLeft] = useState(0);
  useEffect(() => {
    if (left <= 0) return undefined;
    const timer = window.setTimeout(() => setLeft((value) => value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [left]);
  const start = useCallback(() => setLeft(seconds), [seconds]);
  return [left, start];
}
