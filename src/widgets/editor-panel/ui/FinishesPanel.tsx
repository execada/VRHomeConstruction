/**
 * Отделка: текстуры пола, стен (всех сразу) и потолка с масштабом и тонированием.
 * Отдельную стену можно отделать иначе — выделите её в сцене.
 * @module widgets/editor-panel/ui/FinishesPanel
 */

import React, { useState } from 'react';
import { useSelector } from 'react-redux';
import { FinishEditor } from '@/features/textures/ui/FinishEditor';
import { useSceneCommands } from '@/features/editor-3d/model/useSceneCommands';
import { selectors as editorSelectors } from '@/features/editor-3d/selectors';
import { Section, Segmented } from '@/shared/ui/controls';
import styles from './EditorPanel.module.scss';

type Surface = 'floor' | 'walls' | 'ceiling';

const OPTIONS = [
  { value: 'floor' as const, label: 'Пол' },
  { value: 'walls' as const, label: 'Стены' },
  { value: 'ceiling' as const, label: 'Потолок' },
];

export const FinishesPanel: React.FC = () => {
  const commands = useSceneCommands();
  const finishes = useSelector(editorSelectors.selectFinishes);
  const [surface, setSurface] = useState<Surface>('floor');
  const finish = surface === 'walls' ? finishes.walls.front : finishes[surface];

  return (
    <>
      <h2 className={styles.panelTitle}>Отделка</h2>
      <Section title="Поверхность">
        <Segmented ariaLabel="Поверхность" options={OPTIONS} value={surface} onChange={setSurface} />
        {surface === 'walls' && <span className={styles.muted}>Применяется ко всем стенам. Чтобы отделать одну стену, кликните по ней в сцене.</span>}
      </Section>
      <Section title="Галерея текстур">
        <FinishEditor
          category={surface === 'walls' ? 'wall' : surface}
          finish={finish}
          onChange={(next) => commands.room.setFinish(surface, next)}
        />
      </Section>
    </>
  );
};
