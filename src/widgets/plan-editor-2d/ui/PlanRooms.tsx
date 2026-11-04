/**
 * Помещения на плане: заливка по граням стен, название и площадь в центре.
 * Клик по помещению выделяет его (название, вид, площадь — в инспекторе).
 * @module widgets/plan-editor-2d/ui/PlanRooms
 */

import React from 'react';
import cn from 'classnames';
import { useSelector } from 'react-redux';
import { selectRooms } from '@/features/editor-3d/layoutSelectors';
import { ROOM_KINDS, type Room } from '@/features/editor-3d/lib/roomLabels';
import { useSceneCommands } from '@/features/editor-3d/model/useSceneCommands';
import { selectors as selectionSelectors } from '@/features/selection/selectors';
import { formatArea } from '@/shared/lib/units';
import { polygonPoints } from '../lib/plan';
import styles from './PlanEditor2D.module.scss';

const PlanRoom: React.FC<{ room: Room; selected: boolean }> = ({ room, selected }) => {
  const commands = useSceneCommands();
  const path = [room.inner, ...room.holes].map((ring) => `M${polygonPoints(ring).replace(/ /g, 'L')}Z`).join(' ');
  const kind = room.kind === 'room' ? '' : ` · ${ROOM_KINDS[room.kind].label.toLowerCase()}`;
  return (
    <g>
      <path
        d={path}
        fillRule="evenodd"
        className={cn(styles.room, room.kind !== 'room' && styles.roomOutdoor, selected && styles.roomSelected)}
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          e.stopPropagation();
          commands.select({ kind: 'room', point: [room.center[0], room.center[1]] });
        }}
      >
        <title>{`${room.name}: ${formatArea(room.area)}`}</title>
      </path>
      <text x={room.center[0]} y={room.center[1] - 0.06} fontSize={0.22} className={styles.roomName}>
        {room.name}
      </text>
      <text x={room.center[0]} y={room.center[1] + 0.22} fontSize={0.17} className={styles.roomArea}>
        {formatArea(room.area)}
        {kind}
      </text>
    </g>
  );
};

export const PlanRooms: React.FC = () => {
  const rooms = useSelector(selectRooms);
  const selected = useSelector(selectionSelectors.selectSelectedRoom);
  return (
    <g>
      {rooms.map((room) => (
        <PlanRoom key={room.key} room={room} selected={selected?.key === room.key} />
      ))}
    </g>
  );
};
