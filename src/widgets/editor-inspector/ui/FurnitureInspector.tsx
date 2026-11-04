/**
 * Свойства предмета мебели: положение, поворот, высота над полом, опора (на чём стоит
 * предмет или сколько предметов стоит на нём), масштаб, тонирование, закрепление,
 * дублирование и удаление.
 * @module widgets/editor-inspector/ui/FurnitureInspector
 */

import React from 'react';
import { useSelector } from 'react-redux';
import type { FurnitureItem } from '@/features/furniture/types';
import { selectFurnitureCatalog } from '@/features/furniture/model/selectors';
import { selectors as furnitureSelectors } from '@/features/furniture/selectors';
import { catalogEntry, HEAVY_MODEL_BYTES } from '@/features/furniture/catalog';
import { itemSizes } from '@/features/editor-3d/lib/placement';
import { useSceneCommands } from '@/features/editor-3d/model/useSceneCommands';
import { pluralize } from '@/shared/lib/plural';
import { Button, ColorField, FieldRow, IconButton, NumberField, Section, Slider, Toggle } from '@/shared/ui/controls';
import { InspectorHeader, Readout } from './InspectorHeader';
import { cm, toDegrees, toRadians } from '../lib/format';
import styles from './EditorInspector.module.scss';

/** Связь с опорой: на чём стоит предмет (и кнопка «на пол») или сколько предметов стоит на нём. */
const SupportInfo: React.FC<{ item: FurnitureItem }> = ({ item }) => {
  const commands = useSceneCommands();
  const items = useSelector(furnitureSelectors.selectFurnitureItems);
  const support = item.supportId ? items.find((i) => i.id === item.supportId) : undefined;
  const carried = items.filter((i) => i.supportId === item.id).length;
  if (support) {
    return (
      <>
        <Readout label="Стоит на" value={support.name || 'опоре'} />
        <div className={styles.actions}>
          <Button size="sm" icon="download" disabled={item.locked} title="Снять с поверхности на пол рядом" onClick={() => commands.furniture.dropToFloor(item.id)}>
            Поставить на пол
          </Button>
        </div>
      </>
    );
  }
  return carried > 0 ? <Readout label="На поверхности" value={pluralize(carried, ['предмет', 'предмета', 'предметов'])} /> : null;
};

export const FurnitureInspector: React.FC<{ item: FurnitureItem }> = ({ item }) => {
  const commands = useSceneCommands();
  const catalog = useSelector(selectFurnitureCatalog);
  const entry = catalogEntry(catalog, item.modelPath);
  const sizes = itemSizes(item);
  const f = commands.furniture;

  return (
    <>
      <InspectorHeader
        icon="sofa"
        title={item.name || entry?.name || 'Предмет'}
        subtitle={entry?.category}
        action={<IconButton icon={item.locked ? 'lock' : 'unlock'} label={item.locked ? 'Открепить (L)' : 'Закрепить (L)'} active={item.locked} onClick={() => f.toggleLock(item.id)} />}
      />
      <Section title="Положение">
        <FieldRow>
          <NumberField label="X" unit="см" scale={100} precision={0} value={item.position[0]} disabled={item.locked} onChange={(x) => f.move(item.id, [x, item.position[2]])} />
          <NumberField label="Z" unit="см" scale={100} precision={0} value={item.position[2]} disabled={item.locked} onChange={(z) => f.move(item.id, [item.position[0], z])} />
        </FieldRow>
        <NumberField label="Высота над полом" unit="см" scale={100} precision={0} min={0} value={item.position[1]} disabled={item.locked} onChange={(y) => f.setElevation(item.id, y)} />
        <SupportInfo item={item} />
        <Slider
          label="Поворот"
          value={toDegrees(item.rotation[1])}
          min={-180}
          max={180}
          step={1}
          format={(v) => `${v}°`}
          disabled={item.locked}
          onChange={(deg) => f.rotate(item.id, toRadians(deg))}
        />
        <div className={styles.actions}>
          <Button size="sm" icon="rotate" disabled={item.locked} title="По часовой стрелке (R)" onClick={() => f.rotateBy(item.id, -Math.PI / 2)}>
            90° ↻
          </Button>
          <Button size="sm" disabled={item.locked} title="Против часовой стрелки (Shift+R)" onClick={() => f.rotateBy(item.id, Math.PI / 2)}>
            90° ↺
          </Button>
        </div>
      </Section>
      <Section title="Размер">
        <Slider label="Масштаб" value={Math.round(item.scale * 100)} min={20} max={300} step={1} format={(v) => `${v}%`} onChange={(v) => f.setScale(item.id, v / 100)} />
        <Readout label="Ширина × глубина × высота" value={`${cm(sizes.halfWidth * 2)} × ${cm(sizes.halfDepth * 2)} × ${cm(sizes.height)}`} />
        {entry?.sizeBytes !== undefined && entry.sizeBytes > HEAVY_MODEL_BYTES && (
          <span className={styles.hint}>Тяжёлая модель ({Math.round(entry.sizeBytes / 1048576)} МБ) — может медленно грузиться в VR-шлеме.</span>
        )}
      </Section>
      <Section title="Цвет">
        <Toggle label="Своё тонирование" checked={Boolean(item.color)} onChange={(on) => f.setColor(item.id, on ? '#d9c7b0' : null)} />
        {item.color && <ColorField label="Цвет тонирования" value={item.color} onChange={(c) => f.setColor(item.id, c)} />}
      </Section>
      <Section title="Действия">
        <div className={styles.actions}>
          <Button size="sm" icon="copy" onClick={() => f.duplicate(item.id)}>
            Дублировать
          </Button>
          <Button size="sm" variant="danger" icon="trash" onClick={() => f.remove(item.id)}>
            Удалить
          </Button>
        </div>
        {entry?.credit && (
          <span className={styles.hint}>
            Модель: {entry.credit.author}, лицензия {entry.credit.license}
          </span>
        )}
      </Section>
    </>
  );
};
