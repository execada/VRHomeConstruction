/**
 * Редактор отделки поверхности: галерея текстур (PBR + базовые), масштаб текстуры,
 * цвет тонирования. Используется для пола, стен, потолка и перегородок.
 * @module textures/ui/FinishEditor
 */

import React, { memo, useMemo } from 'react';
import cn from 'classnames';
import { useSelector } from 'react-redux';
import type { SurfaceFinish } from '@/features/editor-3d/types';
import { ColorField, Slider } from '@/shared/ui/controls';
import { BARE_FINISH_ID, isBareFinish, texturesFor } from '../lib/catalog';
import { textureThumbnail } from '../lib/textureCache';
import { selectTextureCatalog } from '../model/selectors';
import type { TextureCategory } from '../types';
import styles from './FinishEditor.module.scss';

interface FinishEditorProps {
  category: TextureCategory;
  finish: SurfaceFinish;
  onChange: (finish: SurfaceFinish) => void;
  /** Вариант «Без отделки» (стены): превью конструкционного материала */
  bare?: { thumbnail: string | null };
}

const NEUTRAL_TINT = '#ffffff';

const BareTile: React.FC<{ selected: boolean; thumbnail: string | null; onPick: () => void }> = ({ selected, thumbnail, onPick }) => (
  <button
    type="button"
    role="option"
    aria-selected={selected}
    className={cn(styles.tile, selected && styles.selected)}
    onClick={onPick}
    title="Без отделки: видна конструкция стены"
  >
    <span className={styles.preview} style={thumbnail ? { backgroundImage: `url("${thumbnail}")` } : undefined} />
    <span className={styles.name}>Без отделки</span>
  </button>
);

export const FinishEditor: React.FC<FinishEditorProps> = memo(({ category, finish, onChange, bare }) => {
  const catalog = useSelector(selectTextureCatalog);
  const textures = useMemo(() => texturesFor(catalog, category), [catalog, category]);
  const current = textures.find((t) => t.id === finish.textureId);
  const isBare = isBareFinish(finish);

  const pick = (textureId: string | null) => {
    // Текстура выглядит как задумано с белым тонированием; однотонной поверхности нужен цвет.
    const toTexture = textureId !== null && textureId !== BARE_FINISH_ID;
    const fromTexture = finish.textureId !== null && !isBare;
    onChange({ ...finish, textureId, color: toTexture && !fromTexture ? NEUTRAL_TINT : finish.color });
  };

  return (
    <>
      <div className={styles.gallery} role="listbox" aria-label="Текстуры">
        {bare && <BareTile selected={isBare} thumbnail={bare.thumbnail} onPick={() => pick(BARE_FINISH_ID)} />}
        <button
          type="button"
          role="option"
          aria-selected={!finish.textureId}
          className={cn(styles.tile, !finish.textureId && styles.selected)}
          onClick={() => pick(null)}
        >
          <span className={cn(styles.preview, styles.plain)} style={{ backgroundColor: finish.textureId && !isBare ? undefined : finish.color }}>
            {finish.textureId && !isBare ? 'Цвет' : ''}
          </span>
          <span className={styles.name}>Однотонная</span>
        </button>
        {textures.map((t) => {
          const thumb = textureThumbnail(t);
          return (
            <button
              key={t.id}
              type="button"
              role="option"
              aria-selected={t.id === finish.textureId}
              className={cn(styles.tile, t.id === finish.textureId && styles.selected)}
              onClick={() => pick(t.id)}
              title={t.label}
            >
              <span className={styles.preview} style={thumb ? { backgroundImage: `url("${thumb}")` } : undefined} />
              <span className={styles.name}>{t.label}</span>
            </button>
          );
        })}
      </div>
      {finish.textureId && !isBare && (
        <Slider
          label="Масштаб текстуры"
          value={finish.scale}
          min={0.25}
          max={4}
          step={0.05}
          format={(v) => `×${v.toFixed(2)}`}
          onChange={(scale) => onChange({ ...finish, scale })}
        />
      )}
      {isBare ? (
        <span className={styles.credit}>Отделки нет — видна кладка или обшивка стены.</span>
      ) : (
        <ColorField label={finish.textureId ? 'Цвет тонирования' : 'Цвет'} value={finish.color} onChange={(color) => onChange({ ...finish, color })} />
      )}
      {current?.credit && (
        <span className={styles.credit}>
          {current.credit.author} · {current.credit.license}
        </span>
      )}
    </>
  );
});
