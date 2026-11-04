/**
 * Дверь в дверном проёме: модель (или пустой проём), открыта/закрыта, сторона открывания
 * (у внешней стены — в комнату или наружу, у внутренней — в какое помещение),
 * петли слева/справа (если смотреть со стороны открывания), цвет полотна.
 * @module widgets/editor-inspector/ui/DoorEditor
 */

import React from 'react';
import cn from 'classnames';
import { useSelector } from 'react-redux';
import { selectRooms } from '@/features/editor-3d/layoutSelectors';
import { DOOR_STYLES, doorStyle, hingeForHand, hingeHand, type DoorSpec } from '@/features/editor-3d/lib/doors';
import { roomAt } from '@/features/editor-3d/lib/rooms';
import { isWallSide, partitionFrame, wallToWorld } from '@/features/editor-3d/lib/walls';
import { useSceneCommands } from '@/features/editor-3d/model/useSceneCommands';
import { selectors as editorSelectors } from '@/features/editor-3d/selectors';
import type { Opening } from '@/features/editor-3d/types';
import { ColorField, Segmented, Toggle } from '@/shared/ui/controls';
import styles from './WallConstructionEditor.module.scss';

/** Подписи сторон открывания: «в комнату/наружу» или названия помещений по обе стороны стены. */
function useSwingLabels(hostId: string, opening: Opening): Record<DoorSpec['swing'], string> {
  const partitions = useSelector(editorSelectors.selectPartitions);
  const rooms = useSelector(selectRooms);
  if (isWallSide(hostId)) return { front: 'В помещение', back: 'Наружу' };
  const partition = partitions.find((p) => p.id === hostId);
  if (!partition) return { front: 'Лицевая сторона', back: 'Обратная сторона' };
  const frame = partitionFrame(partition);
  const side = (depth: number) => {
    const [x, , z] = wallToWorld(frame, opening.position[0], 0, depth);
    const room = roomAt(rooms, [x, z]);
    return room ? `В «${room.name}»` : null;
  };
  return { front: side(0.4) ?? 'Лицевая сторона', back: side(-0.4) ?? 'Обратная сторона' };
}

export const DoorEditor: React.FC<{ hostId: string; opening: Opening }> = ({ hostId, opening }) => {
  const o = useSceneCommands().openings;
  const door = opening.door;
  const labels = useSwingLabels(hostId, opening);
  const set = (patch: Partial<DoorSpec> | null) => o.setDoor(hostId, opening.id, patch);

  return (
    <>
      <div className={styles.presets} role="radiogroup" aria-label="Модель двери">
        <button type="button" role="radio" aria-checked={!door} className={cn(styles.preset, !door && styles.presetActive)} onClick={() => set(null)}>
          Без двери
        </button>
        {DOOR_STYLES.map((s) => (
          <button
            key={s.id}
            type="button"
            role="radio"
            aria-checked={door?.style === s.id}
            className={cn(styles.preset, door?.style === s.id && styles.presetActive)}
            onClick={() => set({ style: s.id })}
          >
            {s.label}
          </button>
        ))}
      </div>
      {door && (
        <>
          <Toggle label="Дверь открыта" checked={door.open} onChange={() => o.toggleDoor(hostId, opening.id)} />
          <Segmented
            ariaLabel="Сторона открывания"
            options={[{ value: 'front' as const, label: labels.front }, { value: 'back' as const, label: labels.back }]}
            value={door.swing}
            onChange={(swing) => set({ swing, hinge: hingeForHand(hingeHand(door), swing) })}
          />
          {doorStyle(door.style).leaves === 1 && (
            <Segmented
              ariaLabel="Петли"
              options={[{ value: 'left' as const, label: 'Петли слева' }, { value: 'right' as const, label: 'Петли справа' }]}
              value={hingeHand(door)}
              onChange={(hand) => set({ hinge: hingeForHand(hand, door.swing) })}
            />
          )}
          <ColorField label="Цвет полотна" value={door.color} onChange={(color) => set({ color })} />
          <span className={styles.hint}>Петли — как видно со стороны, куда открывается дверь. В 3D дверь открывается повторным кликом, от первого лица и в VR — сразу.</span>
        </>
      )}
    </>
  );
};
