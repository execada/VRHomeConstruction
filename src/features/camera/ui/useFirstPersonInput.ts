/**
 * Ввод для камеры от первого лица: обзор зажатой левой кнопкой мыши (или пальцем)
 * и клавиши движения. Клавиши в полях ввода игнорируются; при потере фокуса
 * нажатые клавиши сбрасываются, чтобы персонаж не «уезжал».
 * @module camera/ui/useFirstPersonInput
 */

import { useEffect, useRef } from 'react';
import type { Vec2 } from '@/shared/lib/math/geometry2d';
import { interactionStore } from '@/features/editor-3d/model/interactionStore';

const SENSITIVITY = 0.0025;
const PITCH_LIMIT = Math.PI / 2.1;

/** Текущее состояние ввода (мутируется обработчиками событий, читается в кадре). */
export interface FirstPersonInput {
  keys: Set<string>;
  yaw: number;
  pitch: number;
  /** Стартовая точка (применяется в первом кадре) */
  start: Vec2 | null;
}

function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return Boolean(el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable));
}

/**
 * @param element - canvas, на котором осматриваются мышью
 */
export function useFirstPersonInput(element: HTMLElement) {
  const input = useRef<FirstPersonInput>({ keys: new Set(), yaw: 0, pitch: 0, start: null });

  useEffect(() => {
    let looking = false;
    let last = { x: 0, y: 0 };
    const state = input.current;

    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      looking = true;
      last = { x: e.clientX, y: e.clientY };
    };
    const onUp = () => {
      looking = false;
    };
    const onMove = (e: PointerEvent) => {
      // Во время перетаскивания мебели камера не вращается.
      if (!looking || interactionStore.getState().mode === 'dragging' || interactionStore.getState().mode === 'rotating') return;
      state.yaw -= (e.clientX - last.x) * SENSITIVITY;
      state.pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, state.pitch - (e.clientY - last.y) * SENSITIVITY));
      last = { x: e.clientX, y: e.clientY };
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target) || e.metaKey) return;
      if (e.code === 'Space') e.preventDefault();
      state.keys.add(e.code);
    };
    const onKeyUp = (e: KeyboardEvent) => state.keys.delete(e.code);
    const onBlur = () => state.keys.clear();

    element.addEventListener('pointerdown', onDown);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      element.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      state.keys.clear();
    };
  }, [element]);

  return input;
}
