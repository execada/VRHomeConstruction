/**
 * Свойства проёма: тип (окно/дверь), дверь в проёме (модель, открывание, петли, цвет),
 * ширина, высота, отступ от пола (0 — панорамное окно), положение вдоль стены, удаление.
 * @module widgets/editor-inspector/ui/OpeningInspector
 */

import React from 'react';
import { OPENING_LIMITS, openingCenterRange, openingSill, openingSillRange } from '@/features/editor-3d/lib/openings';
import { isWallSide, WALL_LABELS } from '@/features/editor-3d/lib/walls';
import { useSceneCommands } from '@/features/editor-3d/model/useSceneCommands';
import type { Opening } from '@/features/editor-3d/types';
import { Button, FieldRow, NumberField, Section, Segmented } from '@/shared/ui/controls';
import { DoorEditor } from './DoorEditor';
import { InspectorHeader } from './InspectorHeader';

const TYPE_OPTIONS = [
  { value: 'window' as const, label: 'Окно', icon: 'window' as const },
  { value: 'door' as const, label: 'Дверь', icon: 'door' as const },
];

export const OpeningInspector: React.FC<{ hostId: string; opening: Opening }> = ({ hostId, opening }) => {
  const commands = useSceneCommands();
  const o = commands.openings;
  const host = o.hostOf(hostId);
  if (!host) return null;
  const [uMin, uMax] = openingCenterRange(opening.width, host);
  const [sMin, sMax] = openingSillRange(opening, host);
  const where = isWallSide(hostId) ? `${WALL_LABELS[hostId]} стена` : 'Внутренняя стена';
  const title = opening.type === 'window' ? 'Окно' : opening.door ? 'Дверь' : 'Дверной проём';

  return (
    <>
      <InspectorHeader icon={opening.type === 'window' ? 'window' : 'door'} title={title} subtitle={where} />
      <Section title="Тип">
        <Segmented ariaLabel="Тип проёма" options={TYPE_OPTIONS} value={opening.type} onChange={(type) => o.setType(hostId, opening.id, type)} />
      </Section>
      {opening.type === 'door' && (
        <Section title="Дверь">
          <DoorEditor hostId={hostId} opening={opening} />
        </Section>
      )}
      <Section title="Размер проёма">
        <FieldRow>
          <NumberField label="Ширина" unit="см" scale={100} precision={0} min={OPENING_LIMITS.minWidth} max={host.length} value={opening.width} onChange={(width) => o.resize(hostId, opening.id, { width })} />
          <NumberField label="Высота" unit="см" scale={100} precision={0} min={OPENING_LIMITS.minHeight} max={host.height} value={opening.height} onChange={(height) => o.resize(hostId, opening.id, { height })} />
        </FieldRow>
      </Section>
      <Section title="Положение">
        {opening.type === 'window' && (
          <NumberField label="Отступ от пола" unit="см" scale={100} precision={0} min={sMin} max={sMax} value={openingSill(opening)} onChange={(sill) => o.setSill(hostId, opening.id, sill)} />
        )}
        <NumberField
          label="Смещение от центра стены"
          unit="см"
          scale={100}
          precision={0}
          min={uMin}
          max={uMax}
          value={opening.position[0]}
          onChange={(u) => o.setOffset(hostId, opening.id, u)}
        />
      </Section>
      <Section title="Действия">
        <FieldRow>
          <Button size="sm" variant="danger" icon="trash" onClick={() => o.remove(hostId, opening.id)}>
            Удалить проём
          </Button>
        </FieldRow>
      </Section>
    </>
  );
};
