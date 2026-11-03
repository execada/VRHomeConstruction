/**
 * Конструкция стены: материал (кирпич, газобетон, гипсокартон…) и толщина с типовыми
 * значениями для выбранного материала. Общий для внешних и внутренних стен.
 * @module widgets/editor-inspector/ui/WallConstructionEditor
 */

import React, { memo } from 'react';
import cn from 'classnames';
import { thicknessPresets, WALL_MATERIALS, wallMaterial, wallMaterialTexture } from '@/features/editor-3d/lib/wallMaterials';
import type { WallMaterialId } from '@/features/editor-3d/types';
import { textureThumbnail } from '@/features/textures/lib/textureCache';
import { NumberField } from '@/shared/ui/controls';
import styles from './WallConstructionEditor.module.scss';

interface WallConstructionEditorProps {
  material: WallMaterialId;
  thickness: number;
  /** Допустимая толщина [мин, макс], м */
  limits: readonly [number, number];
  onMaterial: (material: WallMaterialId) => void;
  onThickness: (thickness: number) => void;
}

const MaterialGallery: React.FC<{ value: WallMaterialId; onChange: (id: WallMaterialId) => void }> = ({ value, onChange }) => (
  <div className={styles.gallery} role="listbox" aria-label="Материал стены">
    {WALL_MATERIALS.map((m) => {
      const thumb = textureThumbnail(wallMaterialTexture(m.id));
      return (
        <button
          key={m.id}
          type="button"
          role="option"
          aria-selected={m.id === value}
          title={m.hint}
          className={cn(styles.tile, m.id === value && styles.selected)}
          onClick={() => onChange(m.id)}
        >
          <span className={styles.preview} style={thumb ? { backgroundImage: `url("${thumb}")` } : { backgroundColor: m.swatch }} />
          <span className={styles.name}>{m.label}</span>
        </button>
      );
    })}
  </div>
);

export const WallConstructionEditor: React.FC<WallConstructionEditorProps> = memo(
  ({ material, thickness, limits, onMaterial, onThickness }) => {
    const presets = thicknessPresets(material, limits);
    return (
      <>
        <MaterialGallery value={material} onChange={onMaterial} />
        <span className={styles.hint}>{wallMaterial(material).hint}</span>
        <NumberField label="Толщина" unit="см" scale={100} precision={1} min={limits[0]} max={limits[1]} value={thickness} onChange={onThickness} />
        {presets.length > 0 && (
          <div className={styles.presets} role="group" aria-label="Типовая толщина">
            {presets.map((t) => (
              <button
                key={t}
                type="button"
                className={cn(styles.preset, Math.abs(t - thickness) < 1e-6 && styles.presetActive)}
                onClick={() => onThickness(t)}
              >
                {Number((t * 100).toFixed(1))} см
              </button>
            ))}
          </div>
        )}
      </>
    );
  },
);
