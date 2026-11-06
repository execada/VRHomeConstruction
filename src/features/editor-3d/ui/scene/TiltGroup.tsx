/**
 * Наклон модели назад (подушка у спинки или лёжа на сиденье): поворот вокруг нижней кромки
 * со сдвигом, при котором низ наклонённой модели остаётся на месте предмета, а занятое ей
 * место — по центру. Без наклона — просто дети.
 * @module editor-3d/ui/scene/TiltGroup
 */

import React from 'react';
import { tiltPivot, type UprightSizes } from '../../lib/tilt';

interface TiltGroupProps {
  /** Наклон назад, рад (0 — без наклона) */
  tilt: number;
  /** Габариты модели без наклона (при её масштабе) */
  sizes: UprightSizes;
  children: React.ReactNode;
}

export const TiltGroup: React.FC<TiltGroupProps> = ({ tilt, sizes, children }) => {
  if (tilt === 0) return <>{children}</>;
  const { lift, shift } = tiltPivot(sizes, tilt);
  return (
    <group position={[0, lift, shift]} rotation={[-tilt, 0, 0]}>
      {children}
    </group>
  );
};
