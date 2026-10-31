/**
 * Переключатель камер по режиму: облёт, от первого лица, план сверху, фиксированный вид.
 * В VR-сессии камерой управляет шлем — риги не монтируются.
 * @module camera/ui/CameraRig
 */

import React from 'react';
import { useSelector } from 'react-redux';
import { useXR } from '@react-three/xr';
import { selectors } from '../selectors';
import { FirstPersonRig } from './FirstPersonRig';
import { FixedRig } from './FixedRig';
import { OrbitRig } from './OrbitRig';
import { TopRig } from './TopRig';

export const CameraRig: React.FC = () => {
  const mode = useSelector(selectors.selectCameraMode);
  const inXR = useXR((s) => s.session != null);
  if (inXR) return null;
  switch (mode) {
    case 'fps':
      return <FirstPersonRig />;
    case 'top':
      return <TopRig />;
    case 'fixed':
      return <FixedRig />;
    default:
      return <OrbitRig />;
  }
};
