/**
 * Размещение модели из каталога: полупрозрачный «призрак» следует за курсором по полу,
 * сразу «прижат» к полу и к ближайшей стене, краснеет, если места нет. Небольшие предметы
 * (лампа, ваза, книги) встают на столешницу или полку, на которую указывает курсор.
 * Клик ставит предмет туда, где стоит призрак (обрабатывает вьюпорт, см. SceneViewport);
 * Shift+клик — поставить и продолжить; Esc — отмена; R — поворот.
 * @module editor-3d/ui/scene/PlacementLayer
 */

import React from 'react';
import { useSelector } from 'react-redux';
import { NormalizedModel } from '@/features/furniture/ui/NormalizedModel';
import { useExternalStore } from '@/shared/lib/externalStore';
import { selectors as editorSelectors } from '../../selectors';
import { useSceneCommands } from '../../model/useSceneCommands';
import { interaction, interactionStore } from '../../model/interactionStore';
import { HELPER_DATA, floorRay, rayToFloor, toRay3, type ScenePointerEvent } from './pointer';

const GHOST_LOOK = { ghost: true };
const INVALID_LOOK = { ghost: true, invalid: true };

const PlacementSurface: React.FC<{ path: string }> = ({ path }) => {
  const commands = useSceneCommands();
  const dims = useSelector(editorSelectors.selectDimensions);
  const ghost = useExternalStore(interactionStore, (s) => s.ghost);

  const update = (e: ScenePointerEvent) => {
    const ray = floorRay(e.ray);
    const hit = rayToFloor(ray);
    const { placingAngle, placingName } = interactionStore.getState();
    const options = { name: placingName ?? '', aim: { ray: toRay3(ray) } };
    if (hit) interaction.setGhost(commands.furniture.previewPlacement(path, hit, placingAngle, options));
  };

  return (
    <>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.002, 0]} onPointerMove={update}>
        <planeGeometry args={[dims.width + 8, dims.depth + 8]} />
        <meshBasicMaterial visible={false} />
      </mesh>
      {ghost && (
        <group position={[ghost.center[0], ghost.elevation, ghost.center[1]]} rotation={[0, ghost.angle, 0]} userData={HELPER_DATA}>
          <NormalizedModel path={path} look={ghost.valid ? GHOST_LOOK : INVALID_LOOK} />
        </group>
      )}
    </>
  );
};

export const PlacementLayer: React.FC = () => {
  const path = useExternalStore(interactionStore, (s) => (s.mode === 'placing' ? s.placingPath : null));
  return path ? <PlacementSurface path={path} /> : null;
};
