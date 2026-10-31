/**
 * Фиксированный вид: камера закреплена в выбранной точке (для презентации и скриншотов).
 * Переход между видами — плавный перелёт. Объекты по-прежнему можно выделять и двигать.
 * @module camera/ui/FixedRig
 */

import React, { useEffect, useRef } from 'react';
import { useSelector } from 'react-redux';
import { PerspectiveCamera } from '@react-three/drei';
import { selectors as editorSelectors } from '@/features/editor-3d/selectors';
import { selectors } from '../selectors';
import { fixedViewPose } from '../lib/views';
import { useCameraTransition } from './useCameraTransition';

const NO_CONTROLS = { current: null };

export const FixedRig: React.FC = () => {
  const dims = useSelector(editorSelectors.selectDimensions);
  const view = useSelector(selectors.selectFixedView);
  const viewRequest = useSelector(selectors.selectViewRequest);
  const flyTo = useCameraTransition(NO_CONTROLS);
  const mounted = useRef(false);

  useEffect(() => {
    flyTo(fixedViewPose(view, dims), !mounted.current);
    mounted.current = true;
  }, [view, dims, viewRequest, flyTo]);

  return <PerspectiveCamera makeDefault fov={50} near={0.05} far={900} />;
};
