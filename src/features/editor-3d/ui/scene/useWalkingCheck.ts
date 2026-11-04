/**
 * Режим «от первого лица» вне VR. Зажатая кнопка мыши (или палец) там — осмотр, поэтому
 * стены и проёмы не захватывают указатель, а выделяются кликом. Мебель по-прежнему можно тянуть.
 * @module editor-3d/ui/scene/useWalkingCheck
 */

import { useCallback } from 'react';
import { useStore } from 'react-redux';
import { useXR } from '@react-three/xr';
import type { RootState } from '@/app/store';
import { selectors as cameraSelectors } from '@/features/camera/selectors';

/** Проверка на момент события: читает стор при вызове, а не подписывается на него. */
export function useWalkingCheck(): () => boolean {
  const store = useStore<RootState>();
  const inXR = useXR((s) => s.session != null);
  return useCallback(() => !inXR && cameraSelectors.selectCameraMode(store.getState()) === 'fps', [store, inXR]);
}
