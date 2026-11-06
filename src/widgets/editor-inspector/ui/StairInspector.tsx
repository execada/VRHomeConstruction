/**
 * Свойства лестницы: вариант (прямой марш или с площадкой), ширина, поворот на 90°,
 * положение, расчёт ступеней (высота подъёма, число и высота подступёнков, проступь,
 * длина марша) и удаление. Ступени считаются от высоты этажа и перекрытия.
 * @module widgets/editor-inspector/ui/StairInspector
 */

import React from 'react';
import { useSelector } from 'react-redux';
import { buildingSelectors } from '@/features/editor-3d/building/selectors';
import { STAIR_KIND_LABELS, STAIR_WIDTH_LIMITS, stairLayout } from '@/features/editor-3d/lib/stairs/stairs';
import { useSceneCommands } from '@/features/editor-3d/model/useSceneCommands';
import type { Stair, StairKind } from '@/features/editor-3d/types';
import { formatMeters } from '@/shared/lib/units';
import { Button, FieldRow, NumberField, Section, Segmented } from '@/shared/ui/controls';
import { InspectorHeader, Readout } from './InspectorHeader';

const KIND_OPTIONS: Array<{ value: StairKind; label: string }> = [
  { value: 'straight', label: 'Прямая' },
  { value: 'landing', label: 'С площадкой' },
];

const cm = (meters: number) => `${Math.round(meters * 1000) / 10} см`.replace('.', ',');

export const StairInspector: React.FC<{ stair: Stair }> = ({ stair }) => {
  const commands = useSceneCommands();
  const rise = useSelector(buildingSelectors.selectActiveRise);
  const floors = useSelector(buildingSelectors.selectFloorMetas);
  const activeIndex = useSelector(buildingSelectors.selectActiveIndex);
  const layout = stairLayout(stair.kind, rise, stair.width);
  const s = commands.stairs;
  const above = floors[activeIndex + 1];

  return (
    <>
      <InspectorHeader icon="stairs" title={STAIR_KIND_LABELS[stair.kind]} subtitle={above ? `Ведёт: ${above.name}` : 'Ведёт на крышу'} />
      <Section title="Вариант">
        <Segmented ariaLabel="Вариант лестницы" options={KIND_OPTIONS} value={stair.kind} onChange={(kind) => s.setKind(stair.id, kind)} />
      </Section>
      <Section title="Размеры">
        <NumberField
          label="Ширина марша"
          unit="см"
          scale={100}
          precision={0}
          min={STAIR_WIDTH_LIMITS[0]}
          max={STAIR_WIDTH_LIMITS[1]}
          value={stair.width}
          onChange={(width) => s.setWidth(stair.id, width)}
        />
        <Readout label="Высота подъёма" value={formatMeters(layout.rise)} />
        <Readout label="Ступени" value={`${layout.risers} × ${cm(layout.riser)}`} />
        <Readout label="Проступь" value={cm(layout.going)} />
        <Readout label="Длина марша" value={formatMeters(layout.length)} />
      </Section>
      <Section title="Положение">
        <FieldRow>
          <NumberField label="X" unit="см" scale={100} precision={0} value={stair.position[0]} onChange={(x) => s.move(stair.id, [x, stair.position[1]])} />
          <NumberField label="Z" unit="см" scale={100} precision={0} value={stair.position[1]} onChange={(z) => s.move(stair.id, [stair.position[0], z])} />
        </FieldRow>
        <Button size="sm" icon="rotate" onClick={() => s.rotate(stair.id, stair.rotation - Math.PI / 2)}>
          Повернуть на 90°
        </Button>
      </Section>
      <Section title="Действия">
        <FieldRow>
          <Button size="sm" variant="danger" icon="trash" onClick={() => s.remove(stair.id)}>
            Удалить лестницу
          </Button>
        </FieldRow>
      </Section>
    </>
  );
};
