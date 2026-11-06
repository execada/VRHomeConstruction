/**
 * Каталог мебели и лестниц: поиск, категории, карточки с превью.
 * Клик — режим размещения (призрак следует за курсором), перетаскивание — сразу в сцену.
 * Лестницы ставятся инструментом «Лестница» на активный этаж и ведут на этаж выше.
 * @module widgets/editor-panel/ui/CatalogPanel
 */

import React, { useMemo, useState } from 'react';
import cn from 'classnames';
import { useDispatch, useSelector } from 'react-redux';
import { selectFurnitureCatalog } from '@/features/furniture/model/selectors';
import {
  ALL_CATEGORIES,
  catalogCategories,
  filterCatalog,
  formatDimensions,
  HEAVY_MODEL_BYTES,
  type CatalogItem,
} from '@/features/furniture/catalog';
import { preloadModel } from '@/features/furniture/lib/preload';
import { interaction, interactionStore, MODEL_DRAG_TYPE } from '@/features/editor-3d/model/interactionStore';
import { STAIR_KIND_LABELS } from '@/features/editor-3d/lib/stairs/stairs';
import { selectors as editorSelectors } from '@/features/editor-3d/selectors';
import { actions as editorActions } from '@/features/editor-3d/slice';
import type { StairKind } from '@/features/editor-3d/types';
import { useExternalStore } from '@/shared/lib/externalStore';
import { matchesQuery } from '@/shared/lib/search';
import { Icon } from '@/shared/ui/icon/Icon';
import styles from './EditorPanel.module.scss';

/** Категория лестниц в каталоге. */
const STAIRS_CATEGORY = 'Лестницы';

const STAIR_CARDS: Array<{ kind: StairKind; meta: string }> = [
  { kind: 'straight', meta: 'Марш на этаж выше' },
  { kind: 'landing', meta: 'Марш с площадкой' },
];

/** Карточки лестниц: клик включает инструмент «Лестница» с выбранным вариантом. */
const StairCards: React.FC<{ query: string }> = ({ query }) => {
  const dispatch = useDispatch();
  const tool = useSelector(editorSelectors.selectActiveTool);
  const chosen = useExternalStore(interactionStore, (s) => s.stairKind);
  const cards = STAIR_CARDS.filter((c) => matchesQuery([STAIR_KIND_LABELS[c.kind], c.meta, STAIRS_CATEGORY], query));
  return (
    <>
      {cards.map((c) => {
        const active = tool === 'stair' && chosen === c.kind;
        return (
          <button
            key={c.kind}
            type="button"
            className={cn(styles.card, active && styles.cardActive)}
            title={`${STAIR_KIND_LABELS[c.kind]}: кликните по полу, чтобы поставить`}
            onClick={() => {
              interaction.chooseStair(c.kind);
              dispatch(editorActions.setActiveTool(active ? 'select' : 'stair'));
            }}
          >
            <span className={styles.thumb}>
              <Icon name="stairs" size={34} />
            </span>
            <span className={styles.cardName}>{STAIR_KIND_LABELS[c.kind]}</span>
            <span className={styles.cardMeta}>{c.meta}</span>
          </button>
        );
      })}
    </>
  );
};

const SOURCE_LABEL: Record<CatalogItem['source'], string> = {
  asset: 'CC0 · высокое качество',
  primitive: 'Базовая модель',
  user: 'Моя модель',
};

/** Подсказка карточки: название, реальные габариты, источник. */
function cardTitle(item: CatalogItem, heavy: boolean): string {
  if (heavy) return `${item.name} — тяжёлая модель (${Math.round((item.sizeBytes ?? 0) / 1048576)} МБ)`;
  const dims = item.dimensions ? formatDimensions(item.dimensions) : null;
  return [item.name, dims, SOURCE_LABEL[item.source]].filter(Boolean).join(' · ');
}

const CatalogCard: React.FC<{ item: CatalogItem; active: boolean }> = ({ item, active }) => {
  const heavy = (item.sizeBytes ?? 0) > HEAVY_MODEL_BYTES;
  const meta = heavy ? 'Тяжёлая модель' : item.dimensions ? formatDimensions(item.dimensions) : SOURCE_LABEL[item.source];
  return (
    <button
      type="button"
      className={cn(styles.card, active && styles.cardActive)}
      draggable
      title={cardTitle(item, heavy)}
      onMouseEnter={() => preloadModel(item.path)}
      onClick={() => (active ? interaction.reset() : interaction.startPlacing(item.path, item.name))}
      onDragStart={(e) => {
        e.dataTransfer.setData(MODEL_DRAG_TYPE, item.path);
        e.dataTransfer.effectAllowed = 'copy';
        interaction.startPlacing(item.path, item.name);
      }}
      onDragEnd={(e) => {
        if (e.dataTransfer.dropEffect === 'none') interaction.reset();
      }}
    >
      <span className={styles.thumb} style={item.thumbnail ? { backgroundImage: `url("${item.thumbnail}")` } : undefined}>
        {!item.thumbnail && <Icon name="sofa" size={28} />}
      </span>
      <span className={styles.cardName}>{item.name}</span>
      <span className={styles.cardMeta}>{meta}</span>
    </button>
  );
};

export const CatalogPanel: React.FC = () => {
  const catalog = useSelector(selectFurnitureCatalog);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState(ALL_CATEGORIES);
  const categories = useMemo(() => [...catalogCategories(catalog), STAIRS_CATEGORY], [catalog]);
  const items = useMemo(() => (category === STAIRS_CATEGORY ? [] : filterCatalog(catalog, query, category)), [catalog, query, category]);
  const showStairs = category === ALL_CATEGORIES || category === STAIRS_CATEGORY;
  const stairsMatch = STAIR_CARDS.some((c) => matchesQuery([STAIR_KIND_LABELS[c.kind], c.meta, STAIRS_CATEGORY], query));
  const placingPath = useExternalStore(interactionStore, (s) => (s.mode === 'placing' ? s.placingPath : null));

  return (
    <>
      <h2 className={styles.panelTitle}>Каталог</h2>
      <label className={styles.search}>
        <Icon name="search" size={18} />
        <input
          className={styles.searchInput}
          placeholder="Поиск мебели"
          value={query}
          maxLength={60}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Поиск мебели"
        />
      </label>
      <div className={styles.chips} role="tablist" aria-label="Категории">
        {categories.map((c) => (
          <button key={c} type="button" role="tab" aria-selected={c === category} className={cn(styles.chip, c === category && styles.chipActive)} onClick={() => setCategory(c)}>
            {c}
          </button>
        ))}
      </div>
      {items.length === 0 && !(showStairs && stairsMatch) ? (
        <p className={styles.empty}>Ничего не найдено. Попробуйте другой запрос.</p>
      ) : (
        <div className={styles.catalog}>
          {showStairs && <StairCards query={query} />}
          {items.map((item) => (
            <CatalogCard key={item.path} item={item} active={item.path === placingPath} />
          ))}
        </div>
      )}
    </>
  );
};
