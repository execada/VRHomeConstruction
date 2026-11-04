/**
 * Меню на запястье левой руки (VR): каталог мебели, действия с выделенным предметом,
 * открыть/закрыть выделенную дверь, свет, солнце, сохранение и выход из VR. Показ/скрытие — кнопка Y левого контроллера.
 * Нажатия — лучом правого контроллера.
 * @module vr/ui/VrMenu
 */

import React, { useMemo, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useFrame, useThree } from '@react-three/fiber';
import { XRSpace, useXR, useXRInputSourceState } from '@react-three/xr';
import { Vector3 } from 'three';
import { selectFurnitureCatalog } from '@/features/furniture/model/selectors';
import { selectors as selectionSelectors } from '@/features/selection/selectors';
import { selectors as environmentSelectors } from '@/features/environment/selectors';
import { EnvironmentFeature } from '@/features/environment';
import { selectors as editorSelectors } from '@/features/editor-3d/selectors';
import { useSceneCommands } from '@/features/editor-3d/model/useSceneCommands';
import { VrButton } from './VrButton';

interface VrMenuProps {
  /** Сохранить проект */
  onSave: () => void;
}

const PAGE_SIZE = 6;
const COL = 0.14;
const ROW = 0.045;

type Page = 'main' | 'catalog';

/** Точка на полу в 1.6 м перед пользователем. */
function pointAhead(camera: { getWorldPosition: (v: Vector3) => Vector3; getWorldDirection: (v: Vector3) => Vector3 }): [number, number] {
  const pos = camera.getWorldPosition(new Vector3());
  const dir = camera.getWorldDirection(new Vector3()).setY(0).normalize();
  return [pos.x + dir.x * 1.6, pos.z + dir.z * 1.6];
}

const MainPage: React.FC<VrMenuProps & { openCatalog: () => void }> = ({ onSave, openCatalog }) => {
  const dispatch = useDispatch();
  const commands = useSceneCommands();
  const session = useXR((s) => s.session);
  const selection = useSelector(selectionSelectors.selectSelection);
  const opening = useSelector(selectionSelectors.selectSelectedOpeningLive);
  const light = useSelector(editorSelectors.selectLightConfig);
  const sun = useSelector(environmentSelectors.selectSun);
  const hasItem = selection?.kind === 'furniture';
  const door = opening?.opening.door;
  const actions: Array<{ label: string; run: () => void; disabled?: boolean; accent?: boolean }> = [
    { label: 'Каталог', run: openCatalog, accent: true },
    {
      label: door?.open ? 'Закрыть дверь' : 'Открыть дверь',
      run: () => opening && commands.openings.toggleDoor(opening.hostId, opening.opening.id),
      disabled: !door,
    },
    { label: 'Повернуть 90°', run: () => commands.rotateSelection(Math.PI / 2), disabled: !hasItem },
    { label: 'Копия', run: () => commands.duplicateSelection(), disabled: !hasItem },
    { label: 'Удалить', run: () => commands.deleteSelection(), disabled: !selection },
    { label: light.enabled ? 'Свет: вкл' : 'Свет: выкл', run: () => commands.room.setLight({ enabled: !light.enabled }) },
    { label: `Солнце ${Math.round(sun.timeOfDay)}:00 +2ч`, run: () => dispatch(EnvironmentFeature.actions.setSun({ timeOfDay: (sun.timeOfDay + 2) % 24 })) },
    { label: 'Сохранить', run: onSave },
    { label: 'Выйти из VR', run: () => session?.end().catch(() => undefined) },
  ];
  return (
    <>
      {actions.map((a, i) => (
        <VrButton
          key={a.label}
          label={a.label}
          accent={a.accent}
          disabled={a.disabled}
          position={[(i % 2) * COL - COL / 2, -Math.floor(i / 2) * ROW, 0]}
          onSelect={a.run}
        />
      ))}
    </>
  );
};

const CatalogPage: React.FC<{ back: () => void }> = ({ back }) => {
  const catalog = useSelector(selectFurnitureCatalog);
  const commands = useSceneCommands();
  const camera = useThree((s) => s.camera);
  const [page, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(catalog.length / PAGE_SIZE));
  const items = catalog.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);
  return (
    <>
      {items.map((item, i) => (
        <VrButton
          key={item.path}
          label={item.name}
          position={[(i % 2) * COL - COL / 2, -Math.floor(i / 2) * ROW, 0]}
          onSelect={() => commands.furniture.place(item.path, item.name, pointAhead(camera), null)}
        />
      ))}
      <VrButton label="‹ Назад" position={[-COL / 2, -3 * ROW, 0]} onSelect={page > 0 ? () => setPage(page - 1) : back} />
      <VrButton label={`Далее › ${page + 1}/${pages}`} position={[COL / 2, -3 * ROW, 0]} disabled={page >= pages - 1} onSelect={() => setPage(page + 1)} />
    </>
  );
};

export const VrMenu: React.FC<VrMenuProps> = ({ onSave }) => {
  const left = useXRInputSourceState('controller', 'left');
  const [visible, setVisible] = useState(true);
  const [page, setPage] = useState<Page>('main');
  const wasPressed = useRef(false);

  useFrame(() => {
    const pressed = left?.gamepad['y-button']?.state === 'pressed';
    if (pressed && !wasPressed.current) setVisible((v) => !v);
    wasPressed.current = pressed;
  });

  const content = useMemo(
    () => (page === 'main' ? <MainPage onSave={onSave} openCatalog={() => setPage('catalog')} /> : <CatalogPage back={() => setPage('main')} />),
    [page, onSave],
  );

  if (!left?.inputSource.gripSpace || !visible) return null;
  return (
    <XRSpace space={left.inputSource.gripSpace}>
      <group position={[0, 0.06, -0.04]} rotation={[-1.0, 0, 0]}>
        {content}
      </group>
    </XRSpace>
  );
};
