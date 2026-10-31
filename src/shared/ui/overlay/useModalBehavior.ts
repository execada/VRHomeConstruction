/**
 * Общее поведение модальных окон и панелей:
 * - фокус переводится внутрь при открытии (если поле с autoFocus ещё не забрало его);
 * - после закрытия фокус возвращается туда, где был;
 * - Esc закрывает только верхнее окно (диалог поверх панели настроек не закрывает обе).
 * Обработчик закрытия всегда актуальный, но эффект не перезапускается на каждый рендер —
 * иначе фокус «прыгал» бы из поля ввода при каждом нажатии клавиши.
 * @module shared/ui/overlay/useModalBehavior
 */

import { useEffect, useRef, type RefObject } from 'react';

const stack: symbol[] = [];

export function useModalBehavior(ref: RefObject<HTMLElement | null>, onClose: () => void): void {
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    const token = Symbol('modal');
    stack.push(token);
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (ref.current && !ref.current.contains(document.activeElement)) ref.current.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && stack[stack.length - 1] === token) onCloseRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      stack.splice(stack.indexOf(token), 1);
      previous?.focus();
    };
  }, [ref]);
}
