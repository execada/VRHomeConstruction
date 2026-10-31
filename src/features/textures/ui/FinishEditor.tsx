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
import { texturesFor } from '../lib/catalog';
import { textureThumbnail } from '../lib/textureCache';
import { selectTextureCatalog } from '../model/selectors';
import type { TextureCategory } from '../types';
import styles from './FinishEditor.module.scss';

interface FinishEditorProps {
  category: TextureCategory;
  finish: SurfaceFinish;
  onChange: (finish: SurfaceFinish) => void;
}

const NEUTRAL_TINT = '#ffffff';

export const FinishEditor: React.FC<FinishEditorProps> = memo(({ category, finish, onChange }) => {
  const catalog = useSelector(selectTextureCatalog);
  const textures = useMemo(() => texturesFor(catalog, category), [catalog, category]);
  const current = textures.find((t) => t.id === finish.textureId);

  const pick = (textureId: string | null) => {
    // Текстура выглядит как задумано с белым тонированием; однотонной поверхности нужен цвет.
    const color = textureId && !finish.textureId ? NEUTRAL_TINT : finish.color;
    onChange({ ...finish, textureId, color });
  };

  return (
    <>
      <div className={styles.gallery} role="listbox" aria-label="Текстуры">
        <button
          type="button"
          role="option"
          aria-selected={!finish.textureId}
          className={cn(styles.tile, !finish.textureId && styles.selected)}
          onClick={() => pick(null)}
        >
          <span className={cn(styles.preview, styles.plain)} style={{ backgroundColor: finish.textureId ? undefined : finish.color }}>
            {finish.textureId ? 'Цвет' : ''}
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
      {finish.textureId && (
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
      <ColorField label={finish.textureId ? 'Цвет тонирования' : 'Цвет'} value={finish.color} onChange={(color) => onChange({ ...finish, color })} />
      {current?.credit && (
        <span className={styles.credit}>
          {current.credit.author} · {current.credit.license}
        </span>
      )}
    </>
  );
});
