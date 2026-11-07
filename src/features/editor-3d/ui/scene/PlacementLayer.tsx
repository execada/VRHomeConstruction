/**
 * Размещение модели из каталога: полупрозрачный «призрак» следует за курсором по полу,
 * сразу «прижат» к полу и к ближайшей стене, краснеет, если места нет. Небольшие предметы
 * (лампа, ваза, книги) встают на столешницу или полку, на которую указывает курсор; настенные
 * (картины, полки, кондиционеры) — на стену под курсором: указатель ловит невидимая «коробка»
 * комнаты изнутри, поэтому стену можно навести и сверху, и от первого лица.
 * Клик ставит предмет туда, где стоит призрак (обрабатывает вьюпорт, см. SceneViewport);
 * Shift+клик — поставить и продолжить; Esc — отмена; R — поворот.
 * @module editor-3d/ui/scene/PlacementLayer
 */

import React, { useMemo } from 'react';
import { BackSide } from 'three';
import { useSelector } from 'react-redux';
import { NormalizedModel } from '@/features/furniture/ui/NormalizedModel';
import { furnitureSizesCache } from '@/features/furniture/sizesCache';
import { useExternalStore } from '@/shared/lib/externalStore';
import { selectors as editorSelectors } from '../../selectors';
import { useSceneCommands } from '../../model/useSceneCommands';
import { interaction, interactionStore } from '../../model/interactionStore';
import { attachOf } from '../../lib/attachRole';
import { DEFAULT_ITEM_SIZE } from '../../lib/placement';
import { HELPER_DATA, floorRay, rayToFloor, toRay3, type ScenePointerEvent } from './pointer';
import { TiltGroup } from './TiltGroup';

const GHOST_LOOK = { ghost: true };
const INVALID_LOOK = { ghost: true, invalid: true };

const PlacementSurface: React.FC<{ path: string }> = ({ path }) => {
  const commands = useSceneCommands();
  const dims = useSelector(editorSelectors.selectDimensions);
  const ghost = useExternalStore(interactionStore, (s) => s.ghost);
  const name = useExternalStore(interactionStore, (s) => s.placingName);
  const onWall = useMemo(() => attachOf({ modelPath: path, name: name ?? '', ...furnitureSizesCache.get(path) }) === 'wall', [path, name]);

  const update = (e: ScenePointerEvent) => {
    const ray = floorRay(e.ray);
    const hit = rayToFloor(ray);
    const { placingAngle, placingName } = interactionStore.getState();
    const options = { name: placingName ?? '', aim: { ray: toRay3(ray) } };
    // Настенному предмету точка пола не обязательна: стену выбирает луч.
    const center = hit ?? (onWall ? ([ray.origin.x, ray.origin.z] as const) : null);
    if (center) interaction.setGhost(commands.furniture.previewPlacement(path, center, placingAngle, options));
  };

  return (
    <>
      {onWall ? (
        <mesh position={[0, dims.height / 2, 0]} onPointerMove={update}>
          <boxGeometry args={[dims.width, dims.height, dims.depth]} />
          <meshBasicMaterial visible={false} side={BackSide} />
        </mesh>
      ) : (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.002, 0]} onPointerMove={update}>
          <planeGeometry args={[dims.width + 8, dims.depth + 8]} />
          <meshBasicMaterial visible={false} />
        </mesh>
      )}
      {ghost && (
        <group position={[ghost.center[0], ghost.elevation, ghost.center[1]]} rotation={[0, ghost.angle, 0]} userData={HELPER_DATA}>
          <TiltGroup tilt={ghost.tilt ?? 0} sizes={furnitureSizesCache.get(path) ?? DEFAULT_ITEM_SIZE}>
            <NormalizedModel path={path} look={ghost.valid ? GHOST_LOOK : INVALID_LOOK} />
          </TiltGroup>
        </group>
      )}
    </>
  );
};

export const PlacementLayer: React.FC = () => {
  const path = useExternalStore(interactionStore, (s) => (s.mode === 'placing' ? s.placingPath : null));
  return path ? <PlacementSurface path={path} /> : null;
};
