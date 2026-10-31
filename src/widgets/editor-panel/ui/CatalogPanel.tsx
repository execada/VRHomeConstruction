/**
 * Каталог мебели: поиск, категории, карточки с превью.
 * Клик — режим размещения (призрак следует за курсором), перетаскивание — сразу в сцену.
 * @module widgets/editor-panel/ui/CatalogPanel
 */

import React, { useMemo, useState } from 'react';
import cn from 'classnames';
import { useSelector } from 'react-redux';
import { selectFurnitureCatalog } from '@/features/furniture/model/selectors';
import { ALL_CATEGORIES, catalogCategories, filterCatalog, HEAVY_MODEL_BYTES, type CatalogItem } from '@/features/furniture/catalog';
import { preloadModel } from '@/features/furniture/lib/preload';
import { interaction, interactionStore, MODEL_DRAG_TYPE } from '@/features/editor-3d/model/interactionStore';
import { useExternalStore } from '@/shared/lib/externalStore';
import { Icon } from '@/shared/ui/icon/Icon';
import styles from './EditorPanel.module.scss';

const SOURCE_LABEL: Record<CatalogItem['source'], string> = {
  asset: 'CC0 · высокое качество',
  primitive: 'Базовая модель',
  user: 'Моя модель',
};

const CatalogCard: React.FC<{ item: CatalogItem; active: boolean }> = ({ item, active }) => {
  const heavy = (item.sizeBytes ?? 0) > HEAVY_MODEL_BYTES;
  return (
    <button
      type="button"
      className={cn(styles.card, active && styles.cardActive)}
      draggable
      title={heavy ? `${item.name} — тяжёлая модель (${Math.round((item.sizeBytes ?? 0) / 1048576)} МБ)` : item.name}
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
      <span className={styles.cardMeta}>{heavy ? 'Тяжёлая модель' : SOURCE_LABEL[item.source]}</span>
    </button>
  );
};

export const CatalogPanel: React.FC = () => {
  const catalog = useSelector(selectFurnitureCatalog);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState(ALL_CATEGORIES);
  const categories = useMemo(() => catalogCategories(catalog), [catalog]);
  const items = useMemo(() => filterCatalog(catalog, query, category), [catalog, query, category]);
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
      {items.length === 0 ? (
        <p className={styles.empty}>Ничего не найдено. Попробуйте другой запрос.</p>
      ) : (
        <div className={styles.catalog}>
          {items.map((item) => (
            <CatalogCard key={item.path} item={item} active={item.path === placingPath} />
          ))}
        </div>
      )}
    </>
  );
};
