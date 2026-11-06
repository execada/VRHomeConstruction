/**
 * Переключатель камер по режиму: облёт, от первого лица, план сверху, фиксированный вид,
 * улица. В VR-сессии камерой управляет шлем — риги не монтируются.
 * @module camera/ui/CameraRig
 */

import React, { useEffect, useRef } from 'react';
import { useSelector } from 'react-redux';
import { useXR } from '@react-three/xr';
import { selectors } from '../selectors';
import { FirstPersonRig } from './FirstPersonRig';
import { FixedRig } from './FixedRig';
import { OrbitRig } from './OrbitRig';
import { StreetRig } from './StreetRig';
import { TopRig } from './TopRig';

export const CameraRig: React.FC = () => {
  const mode = useSelector(selectors.selectCameraMode);
  const inXR = useXR((s) => s.session != null);
  // Режим до текущего: с улицы от первого лица начинают снаружи здания.
  const previous = useRef(mode);
  const from = previous.current;
  useEffect(() => {
    previous.current = mode;
  }, [mode]);
  if (inXR) return null;
  switch (mode) {
    case 'fps':
      return <FirstPersonRig outside={from === 'street'} />;
    case 'top':
      return <TopRig />;
    case 'fixed':
      return <FixedRig />;
    case 'street':
      return <StreetRig />;
    default:
      return <OrbitRig />;
  }
};
