/**
 * Инспектор: свойства выделенного объекта сцены (общие для 3D, 2D и VR).
 * @module widgets/editor-inspector/ui/EditorInspector
 */

import React from 'react';
import { useSelector } from 'react-redux';
import { selectors as selectionSelectors } from '@/features/selection/selectors';
import { FurnitureInspector } from './FurnitureInspector';
import { OpeningInspector } from './OpeningInspector';
import { PartitionInspector } from './PartitionInspector';
import { RoomInspector, SurfaceInspector } from './RoomInspector';
import { RoomSpaceInspector } from './RoomSpaceInspector';
import { WallInspector } from './WallInspector';
import styles from './EditorInspector.module.scss';

const InspectorBody: React.FC = () => {
  const selection = useSelector(selectionSelectors.selectSelection);
  const item = useSelector(selectionSelectors.selectSelectedItem);
  const partition = useSelector(selectionSelectors.selectSelectedPartitionLive);
  const opening = useSelector(selectionSelectors.selectSelectedOpeningLive);
  const room = useSelector(selectionSelectors.selectSelectedRoom);

  if (item) return <FurnitureInspector key={item.id} item={item} />;
  if (partition) return <PartitionInspector key={partition.id} partition={partition} />;
  if (opening) return <OpeningInspector key={opening.opening.id} hostId={opening.hostId} opening={opening.opening} />;
  if (selection?.kind === 'wall') return <WallInspector key={selection.side} side={selection.side} />;
  if (selection?.kind === 'room' && room) return <RoomSpaceInspector key={room.key} room={room} point={selection.point} />;
  if (selection?.kind === 'floor' || selection?.kind === 'ceiling') return <SurfaceInspector surface={selection.kind} />;
  return <RoomInspector />;
};

export const EditorInspector: React.FC = () => (
  <aside className={styles.panel} aria-label="Свойства">
    <InspectorBody />
  </aside>
);
