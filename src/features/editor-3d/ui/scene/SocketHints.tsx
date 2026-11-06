/**
 * Подсказки посадочных мест: пока размещается или перетаскивается подушка, на диванах и креслах
 * видны места, куда она садится: свободные — голубые, занятые другими подушками — серые;
 * место, куда сядет призрак (или где подушка сейчас), подсвечено ярче. Площадки — вспомогательные
 * объекты редактора: не перехватывают указатель и не попадают в превью проекта.
 * @module editor-3d/ui/scene/SocketHints
 */

import React, { useMemo } from 'react';
import { useSelector } from 'react-redux';
import { Edges } from '@react-three/drei';
import { selectors as furnitureSelectors } from '@/features/furniture/selectors';
import type { FurnitureItem } from '@/features/furniture/types';
import { useExternalStore } from '@/shared/lib/externalStore';
import { interactionStore } from '../../model/interactionStore';
import { cushionOf, socketsOf } from '../../lib/cushionRole';
import { cushionBox, seatOptions, type SeatChoice } from '../../lib/cushionSeats';
import { HELPER_DATA, NO_RAYCAST } from './pointer';
import { DRAFT_ID, useHintSubject } from './useHintSubject';

const FREE_COLOR = '#3b8beb';
const TAKEN_COLOR = '#8c8c8c';
const OPACITY = 0.22;
const ACTIVE_OPACITY = 0.5;
/** Площадка чуть выше сиденья, чтобы не мерцала вместе с обивкой. */
const LIFT = 0.012;

/** Место на модели для подушки. */
interface SeatHint extends SeatChoice {
  hostId: string;
}

/** Места всех диванов и кресел комнаты для подушки. */
function seatHints(items: readonly FurnitureItem[], cushion: FurnitureItem): SeatHint[] {
  const style = cushionOf(cushion);
  if (!style) return [];
  return items
    .filter((i) => i.id !== cushion.id && !i.supportId)
    .flatMap((item) => {
      const sockets = socketsOf(item);
      if (sockets.length === 0) return [];
      const neighbours = items.filter((n) => n.supportId === item.id && n.socket);
      return seatOptions({ item, sockets }, cushion, style, neighbours).map((seat) => ({ ...seat, hostId: item.id }));
    });
}

/** Где подушка сейчас: у призрака — его место, у перетаскиваемой — её место. */
function useActiveSeat(subject: FurnitureItem | null): { hostId: string | null; socket: string | null } {
  const ghostHost = useExternalStore(interactionStore, (s) => s.ghost?.supportId ?? null);
  const ghostSocket = useExternalStore(interactionStore, (s) => s.ghost?.socket ?? null);
  if (subject?.id === DRAFT_ID) return { hostId: ghostHost, socket: ghostSocket };
  return { hostId: subject?.supportId ?? null, socket: subject?.socket ?? null };
}

const SeatPlane: React.FC<{ cushion: FurnitureItem; seat: SeatHint; active: boolean }> = ({ cushion, seat, active }) => {
  const { footprint } = cushionBox(cushion, seat.pose);
  const color = seat.free ? FREE_COLOR : TAKEN_COLOR;
  return (
    <mesh
      position={[footprint.center[0], seat.pose.y + LIFT, footprint.center[1]]}
      rotation={[-Math.PI / 2, 0, footprint.angle]}
      raycast={NO_RAYCAST}
      renderOrder={2}
    >
      <planeGeometry args={[footprint.half[0] * 2, footprint.half[1] * 2]} />
      <meshBasicMaterial color={color} transparent opacity={active ? ACTIVE_OPACITY : OPACITY} depthWrite={false} toneMapped={false} />
      <Edges color={color} transparent opacity={active ? 1 : 0.6} raycast={NO_RAYCAST} />
    </mesh>
  );
};

export const SocketHints: React.FC = () => {
  const subject = useHintSubject();
  const items = useSelector(furnitureSelectors.selectFurnitureItems);
  const active = useActiveSeat(subject);
  const seats = useMemo(() => (subject ? seatHints(items, subject) : []), [items, subject]);
  if (!subject || seats.length === 0) return null;
  return (
    <group userData={HELPER_DATA}>
      {seats.map((seat) => (
        <SeatPlane
          key={`${seat.hostId}:${seat.socket.id}`}
          cushion={subject}
          seat={seat}
          active={seat.hostId === active.hostId && seat.socket.id === active.socket}
        />
      ))}
    </group>
  );
};
