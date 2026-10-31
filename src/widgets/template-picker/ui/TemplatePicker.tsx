/**
 * Окно «Выбор стартового шаблона» (Figma): пустой проект или готовый макет.
 * Второй шаг — галерея встроенных и сохранённых пользователем шаблонов.
 * @module widgets/template-picker/ui/TemplatePicker
 */

import React, { useState } from 'react';
import { useProjectActions } from '@/features/project-actions';
import { TemplateGrid, useTemplateEntries, type TemplateEntry } from '@/features/templates';
import { Button } from '@/shared/ui/controls';
import { Icon } from '@/shared/ui/icon/Icon';
import { IsometricRoom } from '@/shared/ui/illustrations/IsometricRoom';
import { Dialog } from '@/shared/ui/overlay/Dialog';
import styles from './templatePicker.module.scss';

interface StartCardProps {
  title: string;
  description: string;
  furnished?: boolean;
  disabled?: boolean;
  onSelect: () => void;
}

const StartCard: React.FC<StartCardProps> = ({ title, description, furnished, disabled, onSelect }) => (
  <button type="button" className={styles.startCard} onClick={onSelect} disabled={disabled}>
    <span className={styles.startPreview}>
      <IsometricRoom furnished={furnished} className={styles.startIllustration} />
    </span>
    <span className={styles.startInfo}>
      <span className={styles.startText}>
        <span className={styles.startTitle}>{title}</span>
        <span className={styles.startDescription}>{description}</span>
      </span>
      <span className={styles.plus} aria-hidden="true">
        <Icon name="plus" size={22} strokeWidth={2} />
      </span>
    </span>
  </button>
);

export const TemplatePicker: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [step, setStep] = useState<'start' | 'gallery'>('start');
  const [busy, setBusy] = useState(false);
  const { createBlank, createFromBuiltin, createFromLayout } = useProjectActions();
  const { builtin, mine } = useTemplateEntries();

  const run = async (task: () => Promise<void>) => {
    setBusy(true);
    try {
      await task();
    } finally {
      setBusy(false);
    }
  };

  const pick = (entry: TemplateEntry) =>
    void run(() => (entry.kind === 'builtin' ? createFromBuiltin(entry.id) : createFromLayout(entry.id)));

  return (
    <Dialog title={step === 'start' ? 'Выбор стартового шаблона' : 'Готовые макеты'} onClose={onClose} className={styles.dialog}>
      {step === 'start' ? (
        <div className={styles.start}>
          <StartCard
            title="Пустой проект"
            description="Начните с чистого пространства и создайте свой уникальный проект"
            disabled={busy}
            onSelect={() => void run(createBlank)}
          />
          <StartCard
            title="Готовый макет"
            description="Используйте готовый шаблон для быстрого старта"
            furnished
            disabled={busy}
            onSelect={() => setStep('gallery')}
          />
        </div>
      ) : (
        <div className={styles.gallery}>
          <Button variant="ghost" size="sm" icon="chevronLeft" className={styles.back} onClick={() => setStep('start')}>
            Назад
          </Button>
          <TemplateGrid title="Встроенные шаблоны" entries={builtin} onSelect={pick} disabled={busy} compact />
          {mine.length > 0 && <TemplateGrid title="Мои шаблоны" entries={mine} onSelect={pick} disabled={busy} compact />}
        </div>
      )}
    </Dialog>
  );
};
