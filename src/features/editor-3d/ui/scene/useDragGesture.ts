/**
 * Хук жеста перетаскивания объекта сцены (мышь, тачпад, сенсор).
 * Захватывает указатель, сообщает камере, что идёт жест (облёт отключается),
 * и вызывает onStart / onMove / onEnd. Обработчики стабильны между рендерами.
 * @module editor-3d/ui/scene/useDragGesture
 */

import { useMemo, useRef } from 'react';
import { interaction, interactionStore, type InteractionMode } from '../../model/interactionStore';
import { capturePointer, releasePointer, type ScenePointerEvent } from './pointer';

interface DragGestureOptions<C> {
  /** id объекта (для подсветки и блокировки камеры) */
  id: string;
  mode?: Extract<InteractionMode, 'dragging' | 'rotating'>;
  /** Начало жеста; вернуть null, чтобы не перетаскивать (например, предмет закреплён) */
  onStart: (e: ScenePointerEvent) => C | null;
  onMove: (e: ScenePointerEvent, context: C) => void;
  onEnd?: (context: C) => void;
}

/** Обработчики указателя для перетаскивания. */
export interface DragHandlers {
  onPointerDown: (e: ScenePointerEvent) => void;
  onPointerMove: (e: ScenePointerEvent) => void;
  onPointerUp: (e: ScenePointerEvent) => void;
  onPointerCancel: (e: ScenePointerEvent) => void;
}

export function useDragGesture<C>(options: DragGestureOptions<C>): DragHandlers {
  const latest = useRef(options);
  latest.current = options;
  const context = useRef<C | null>(null);

  return useMemo(() => {
    const finish = (e: ScenePointerEvent) => {
      if (context.current === null) return;
      e.stopPropagation();
      releasePointer(e);
      const ctx = context.current;
      context.current = null;
      interaction.reset();
      latest.current.onEnd?.(ctx);
    };
    return {
      onPointerDown: (e) => {
        if (e.button !== 0 || interactionStore.getState().mode === 'placing') return;
        e.stopPropagation();
        const ctx = latest.current.onStart(e);
        if (ctx === null) return;
        capturePointer(e);
        context.current = ctx;
        interaction.startGesture(latest.current.mode ?? 'dragging', latest.current.id);
      },
      onPointerMove: (e) => {
        if (context.current === null) return;
        e.stopPropagation();
        latest.current.onMove(e, context.current);
      },
      onPointerUp: finish,
      onPointerCancel: finish,
    };
  }, []);
}
