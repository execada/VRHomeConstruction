/**
 * Свойства внутренней стены (перегородки): конструкция (материал и толщина), длина, высота,
 * поворот, скругление углов, отделка, добавление проёмов, удаление.
 * @module widgets/editor-inspector/ui/PartitionInspector
 */

import React from 'react';
import { useSelector } from 'react-redux';
import { FinishEditor } from '@/features/textures/ui/FinishEditor';
import { textureThumbnail } from '@/features/textures/lib/textureCache';
import { maxCornerRadius, PARTITION_LIMITS, partitionMaterial } from '@/features/editor-3d/lib/partitions';
import { wallMaterialTexture } from '@/features/editor-3d/lib/wallMaterials';
import { useSceneCommands } from '@/features/editor-3d/model/useSceneCommands';
import { selectors as editorSelectors } from '@/features/editor-3d/selectors';
import type { Partition } from '@/features/editor-3d/types';
import { Button, FieldRow, NumberField, Section, Slider } from '@/shared/ui/controls';
import { InspectorHeader } from './InspectorHeader';
import { WallConstructionEditor } from './WallConstructionEditor';
import { toDegrees, toRadians } from '../lib/format';
import styles from './EditorInspector.module.scss';

export const PartitionInspector: React.FC<{ partition: Partition }> = ({ partition }) => {
  const commands = useSceneCommands();
  const dims = useSelector(editorSelectors.selectDimensions);
  const finishes = useSelector(editorSelectors.selectFinishes);
  const p = commands.partitions;
  const [length, height, thickness] = partition.size;
  const maxRadius = maxCornerRadius(partition);
  const material = partitionMaterial(partition);

  return (
    <>
      <InspectorHeader icon="partition" title="Внутренняя стена" subtitle={`${partition.openings.length} проём(ов)`} />
      <Section title="Конструкция">
        <WallConstructionEditor
          material={material}
          thickness={thickness}
          limits={[PARTITION_LIMITS.minThickness, PARTITION_LIMITS.maxThickness]}
          onMaterial={(m) => p.setMaterial(partition.id, m)}
          onThickness={(v) => p.resize(partition.id, { thickness: v })}
        />
      </Section>
      <Section title="Размеры">
        <FieldRow>
          <NumberField label="Длина" unit="см" scale={100} precision={0} min={PARTITION_LIMITS.minLength} max={Math.max(dims.width, dims.depth)} value={length} onChange={(v) => p.resize(partition.id, { length: v })} />
          <NumberField label="Высота" unit="см" scale={100} precision={0} min={PARTITION_LIMITS.minHeight} max={dims.height} value={height} onChange={(v) => p.resize(partition.id, { height: v })} />
        </FieldRow>
        <Slider
          label="Скругление углов"
          value={Math.round((partition.cornerRadius ?? 0) * 100)}
          min={0}
          max={Math.round(maxRadius * 100)}
          step={1}
          format={(v) => `${v} см`}
          onChange={(v) => p.setCornerRadius(partition.id, v / 100)}
        />
      </Section>
      <Section title="Положение">
        <FieldRow>
          <NumberField label="X" unit="см" scale={100} precision={0} value={partition.position[0]} onChange={(x) => { p.move(partition.id, [x, partition.position[2]]); p.endGesture(); }} />
          <NumberField label="Z" unit="см" scale={100} precision={0} value={partition.position[2]} onChange={(z) => { p.move(partition.id, [partition.position[0], z]); p.endGesture(); }} />
        </FieldRow>
        <Slider
          label="Поворот"
          value={toDegrees(partition.rotation[1])}
          min={-180}
          max={180}
          step={1}
          format={(v) => `${v}°`}
          onChange={(deg) => p.rotate(partition.id, toRadians(deg))}
        />
      </Section>
      <Section title="Отделка">
        <FinishEditor
          category="wall"
          finish={partition.finish ?? finishes.walls.front}
          bare={{ thumbnail: textureThumbnail(wallMaterialTexture(material)) }}
          onChange={(finish) => p.setFinish(partition.id, finish)}
        />
      </Section>
      <Section title="Проёмы и действия">
        <div className={styles.actions}>
          <Button size="sm" icon="window" onClick={() => commands.openings.add(partition.id, 'window')}>
            Окно
          </Button>
          <Button size="sm" icon="door" onClick={() => commands.openings.add(partition.id, 'door')}>
            Дверь
          </Button>
          <Button size="sm" variant="danger" icon="trash" onClick={() => p.remove(partition.id)}>
            Удалить
          </Button>
        </div>
      </Section>
    </>
  );
};
