/**
 * Свойства помещения (вычисленного по стенам): название, вид (комната, лоджия, балкон),
 * площадь по граням стен, периметр, площадь с коэффициентом; отделка пола квартиры.
 * @module widgets/editor-inspector/ui/RoomSpaceInspector
 */

import React, { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import { FinishEditor } from '@/features/textures/ui/FinishEditor';
import { ROOM_KINDS, ROOM_NAME_MAX, ROOM_NAME_PRESETS, type Room } from '@/features/editor-3d/lib/roomLabels';
import { useSceneCommands } from '@/features/editor-3d/model/useSceneCommands';
import { selectors as editorSelectors } from '@/features/editor-3d/selectors';
import type { RoomKind } from '@/features/editor-3d/types';
import { formatArea, formatMeters } from '@/shared/lib/units';
import { Section, Segmented, TextField } from '@/shared/ui/controls';
import { InspectorHeader, Readout } from './InspectorHeader';
import styles from './WallConstructionEditor.module.scss';

const KIND_OPTIONS = (Object.keys(ROOM_KINDS) as RoomKind[]).map((kind) => ({ value: kind, label: ROOM_KINDS[kind].label }));

/** Название: применяется по Enter или при потере фокуса. */
const RoomNameField: React.FC<{ name: string; onCommit: (name: string) => void }> = ({ name, onCommit }) => {
  const [text, setText] = useState(name);
  useEffect(() => setText(name), [name]);
  const commit = () => (text.trim() && text.trim() !== name ? onCommit(text) : setText(name));
  return (
    <TextField
      label="Название"
      value={text}
      maxLength={ROOM_NAME_MAX}
      onChange={setText}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit();
        if (e.key === 'Escape') setText(name);
      }}
    />
  );
};

export const RoomSpaceInspector: React.FC<{ room: Room; point: [number, number] }> = ({ room, point }) => {
  const commands = useSceneCommands();
  const finishes = useSelector(editorSelectors.selectFinishes);
  const factor = ROOM_KINDS[room.kind].factor;
  const rename = (name: string) => commands.rooms.rename(point, name);

  return (
    <>
      <InspectorHeader icon="home" title={room.name} subtitle={`${ROOM_KINDS[room.kind].label} · ${formatArea(room.area)}`} />
      <Section title="Помещение">
        <RoomNameField name={room.name} onCommit={rename} />
        <div className={styles.presets} role="group" aria-label="Типовые названия">
          {ROOM_NAME_PRESETS.map((preset) => (
            <button key={preset} type="button" className={styles.preset} onClick={() => rename(preset)}>
              {preset}
            </button>
          ))}
        </div>
        <Segmented ariaLabel="Вид помещения" options={KIND_OPTIONS} value={room.kind} onChange={(kind) => commands.rooms.setKind(point, kind)} />
      </Section>
      <Section title="Размеры">
        <Readout label="Площадь по граням стен" value={formatArea(room.area, 2)} />
        <Readout label="Периметр" value={formatMeters(room.perimeter)} />
        {factor !== 1 && <Readout label={`В общую площадь (×${String(factor).replace('.', ',')})`} value={formatArea(room.area * factor, 2)} />}
      </Section>
      <Section title="Пол (вся квартира)">
        <FinishEditor category="floor" finish={finishes.floor} onChange={(finish) => commands.room.setFinish('floor', finish)} />
      </Section>
    </>
  );
};
