/**
 * Свойства внешней стены: материал (с применением ко всем стенам), высота и толщина стен,
 * перемещение стены (размер комнаты), проёмы, удаление/возврат стены.
 * @module widgets/editor-inspector/ui/WallInspector
 */

import React from 'react';
import { useSelector } from 'react-redux';
import { FinishEditor } from '@/features/textures/ui/FinishEditor';
import { WALL_THICKNESS_LIMITS } from '@/features/editor-3d/constants';
import { WALL_LABELS, wallFrame } from '@/features/editor-3d/lib/walls';
import { SCENE_LIMITS } from '@/features/editor-3d/lib/scene/schema';
import { useSceneCommands } from '@/features/editor-3d/model/useSceneCommands';
import { selectors as editorSelectors } from '@/features/editor-3d/selectors';
import type { WallSide } from '@/features/editor-3d/types';
import { Button, FieldRow, NumberField, Section } from '@/shared/ui/controls';
import { InspectorHeader } from './InspectorHeader';
import styles from './EditorInspector.module.scss';

export const WallInspector: React.FC<{ side: WallSide }> = ({ side }) => {
  const commands = useSceneCommands();
  const dims = useSelector(editorSelectors.selectDimensions);
  const thickness = useSelector(editorSelectors.selectWallThickness);
  const finishes = useSelector(editorSelectors.selectFinishes);
  const openings = useSelector(editorSelectors.selectOpenings)[side] ?? [];
  const removed = useSelector(editorSelectors.selectRemovedWalls).includes(side);
  const frame = wallFrame(side, dims);
  const across = side === 'left' || side === 'right' ? 'width' : 'depth';
  const room = commands.room;

  return (
    <>
      <InspectorHeader icon="wall" title={`${WALL_LABELS[side]} стена`} subtitle={removed ? 'Удалена' : `${openings.length} проём(ов)`} />
      {!removed && (
        <Section title="Материал стены">
          <FinishEditor category="wall" finish={finishes.walls[side]} onChange={(finish) => room.setFinish(side, finish)} />
          <Button size="sm" onClick={() => room.setFinish('walls', finishes.walls[side])}>
            Применить ко всем стенам
          </Button>
        </Section>
      )}
      <Section title="Размеры">
        <FieldRow>
          <NumberField label="Длина" unit="см" scale={100} precision={0} value={frame.length} disabled onChange={() => undefined} />
          <NumberField
            label="Высота стен"
            unit="см"
            scale={100}
            precision={0}
            min={SCENE_LIMITS.height[0]}
            max={SCENE_LIMITS.height[1]}
            value={dims.height}
            onChange={(height) => room.resize({ ...dims, height })}
          />
        </FieldRow>
        <NumberField
          label="Толщина стен"
          unit="см"
          scale={100}
          precision={1}
          min={WALL_THICKNESS_LIMITS[0]}
          max={WALL_THICKNESS_LIMITS[1]}
          value={thickness}
          onChange={(t) => room.setWallThickness(t)}
        />
        <NumberField
          label="Сдвинуть стену (размер комнаты)"
          unit="см"
          scale={100}
          precision={0}
          min={SCENE_LIMITS[across][0]}
          max={SCENE_LIMITS[across][1]}
          value={dims[across]}
          onChange={(size) => room.dragWall(side, size - dims[across])}
        />
      </Section>
      <Section title="Проёмы и действия">
        <div className={styles.actions}>
          {!removed && (
            <>
              <Button size="sm" icon="window" onClick={() => commands.openings.add(side, 'window')}>
                Окно
              </Button>
              <Button size="sm" icon="door" onClick={() => commands.openings.add(side, 'door')}>
                Дверь
              </Button>
            </>
          )}
          <Button size="sm" variant={removed ? 'primary' : 'danger'} icon={removed ? 'plus' : 'trash'} onClick={() => room.toggleWall(side)}>
            {removed ? 'Вернуть стену' : 'Удалить стену'}
          </Button>
        </div>
      </Section>
    </>
  );
};
