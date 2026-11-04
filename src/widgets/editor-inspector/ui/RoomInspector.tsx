/**
 * Свойства комнаты (ничего не выделено) и отделка пола/потолка.
 * @module widgets/editor-inspector/ui/RoomInspector
 */

import React from 'react';
import { useSelector } from 'react-redux';
import { FinishEditor } from '@/features/textures/ui/FinishEditor';
import { SCENE_LIMITS } from '@/features/editor-3d/lib/scene/schema';
import { useSceneCommands } from '@/features/editor-3d/model/useSceneCommands';
import { selectors as editorSelectors } from '@/features/editor-3d/selectors';
import { FieldRow, NumberField, Section } from '@/shared/ui/controls';
import { InspectorHeader } from './InspectorHeader';
import styles from './EditorInspector.module.scss';

/** Отделка пола или потолка. */
export const SurfaceInspector: React.FC<{ surface: 'floor' | 'ceiling' }> = ({ surface }) => {
  const commands = useSceneCommands();
  const finishes = useSelector(editorSelectors.selectFinishes);
  return (
    <>
      <InspectorHeader icon="texture" title={surface === 'floor' ? 'Пол' : 'Потолок'} subtitle="Отделка поверхности" />
      <Section title={surface === 'floor' ? 'Текстура пола' : 'Текстура потолка'}>
        <FinishEditor category={surface} finish={finishes[surface]} onChange={(finish) => commands.room.setFinish(surface, finish)} />
      </Section>
    </>
  );
};

const Kbd: React.FC<{ children: React.ReactNode }> = ({ children }) => <kbd className={styles.kbd}>{children}</kbd>;

/** Комната целиком: размеры и подсказки. */
export const RoomInspector: React.FC = () => {
  const commands = useSceneCommands();
  const dims = useSelector(editorSelectors.selectDimensions);
  const area = dims.width * dims.depth;
  return (
    <>
      <InspectorHeader icon="home" title="Комната" subtitle={`${area.toFixed(1)} м² · ${(area * dims.height).toFixed(1)} м³`} />
      <Section title="Размеры комнаты">
        <FieldRow>
          <NumberField label="Ширина" unit="м" precision={2} min={SCENE_LIMITS.width[0]} max={SCENE_LIMITS.width[1]} value={dims.width} onChange={(width) => commands.room.resize({ ...dims, width })} />
          <NumberField label="Глубина" unit="м" precision={2} min={SCENE_LIMITS.depth[0]} max={SCENE_LIMITS.depth[1]} value={dims.depth} onChange={(depth) => commands.room.resize({ ...dims, depth })} />
        </FieldRow>
        <NumberField label="Высота" unit="м" precision={2} min={SCENE_LIMITS.height[0]} max={SCENE_LIMITS.height[1]} value={dims.height} onChange={(height) => commands.room.resize({ ...dims, height })} />
      </Section>
      <Section title="Как работать">
        <ul className={styles.hintList}>
          <li>Выберите предмет в каталоге и кликните по полу — он встанет на пол и прижмётся к стене. Лампу, вазу или книги можно поставить на стол, тумбу или полку — подходящие поверхности подсвечиваются.</li>
          <li>Перетаскивайте мебель мышью; кольцо под предметом — поворот.</li>
          <li>Клик по стене, полу или потолку — их отделка и размеры.</li>
          <li>
            <Kbd>R</Kbd> поворот, <Kbd>Del</Kbd> удалить, <Kbd>Ctrl</Kbd>+<Kbd>D</Kbd> копия, <Kbd>G</Kbd> сетка, <Kbd>L</Kbd> закрепить
          </li>
          <li>
            <Kbd>Ctrl</Kbd>+<Kbd>Z</Kbd> отменить, <Kbd>Ctrl</Kbd>+<Kbd>Shift</Kbd>+<Kbd>Z</Kbd> повторить, <Kbd>Ctrl</Kbd>+<Kbd>S</Kbd> сохранить
          </li>
        </ul>
      </Section>
    </>
  );
};
