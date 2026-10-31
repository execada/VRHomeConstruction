/**
 * Страница «Шаблоны» (Figma): встроенные и сохранённые шаблоны комнат с поиском.
 * Выбор шаблона создаёт новый проект и открывает редактор; свои шаблоны можно
 * переименовать и удалить.
 * @module pages/templates/ui/TemplatesPage
 */

import React, { useMemo, useState } from 'react';
import { useProjectActions } from '@/features/project-actions';
import {
  filterTemplates,
  RenameTemplateDialog,
  TemplateGrid,
  useTemplateActions,
  useTemplateEntries,
  type TemplateEntry,
} from '@/features/templates';
import { useStoredState } from '@/shared/lib/useStoredState';
import { SearchField, ViewToggle, viewModeSchema } from '@/shared/ui/controls';
import { EmptyState } from '@/shared/ui/empty-state/EmptyState';
import { ConfirmDialog } from '@/shared/ui/overlay/Dialog';
import styles from './templatesPage.module.scss';

type PendingAction = { kind: 'rename' | 'remove'; entry: TemplateEntry } | null;

export const TemplatesPage: React.FC = () => {
  const { builtin, mine } = useTemplateEntries();
  const { createFromBuiltin, createFromLayout } = useProjectActions();
  const templateActions = useTemplateActions();
  const [query, setQuery] = useState('');
  const [view, setView] = useStoredState('templates-view', viewModeSchema, 'grid');
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<PendingAction>(null);
  const close = () => setPending(null);

  const shownBuiltin = useMemo(() => filterTemplates(builtin, query), [builtin, query]);
  const shownMine = useMemo(() => filterTemplates(mine, query), [mine, query]);
  const manage = useMemo(
    () => ({
      rename: (entry: TemplateEntry) => setPending({ kind: 'rename', entry }),
      remove: (entry: TemplateEntry) => setPending({ kind: 'remove', entry }),
    }),
    [],
  );

  const pick = async (entry: TemplateEntry) => {
    setBusy(true);
    try {
      await (entry.kind === 'builtin' ? createFromBuiltin(entry.id) : createFromLayout(entry.id));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className={styles.page} aria-busy={busy}>
      <h1 className={styles.title}>Шаблоны</h1>
      <p className={styles.lead}>Готовые комнаты с мебелью, отделкой и светом. Выберите шаблон — создадим проект на его основе.</p>
      <div className={styles.toolbar}>
        <SearchField value={query} onChange={setQuery} placeholder="Поиск шаблонов" />
        <ViewToggle value={view} onChange={setView} />
      </div>
      {shownBuiltin.length > 0 && <TemplateGrid title="Встроенные" entries={shownBuiltin} onSelect={(e) => void pick(e)} disabled={busy} view={view} />}
      {shownMine.length > 0 && (
        <TemplateGrid title="Мои шаблоны" entries={shownMine} onSelect={(e) => void pick(e)} disabled={busy} view={view} manage={manage} />
      )}
      {shownBuiltin.length + shownMine.length === 0 && <EmptyState title="Ничего не найдено" text={`Шаблонов по запросу «${query.trim()}» нет.`} />}
      {mine.length === 0 && !query.trim() && (
        <p className={styles.hint}>Свои шаблоны можно сохранить из редактора: меню «⋯» → «Сохранить как шаблон».</p>
      )}
      {pending?.kind === 'rename' && (
        <RenameTemplateDialog currentName={pending.entry.name} onSave={(name) => templateActions.rename(pending.entry.id, name)} onClose={close} />
      )}
      {pending?.kind === 'remove' && (
        <ConfirmDialog
          title="Удалить шаблон?"
          message={`Шаблон «${pending.entry.name}» будет удалён. Проекты, созданные из него, останутся.`}
          confirmLabel="Удалить"
          danger
          onConfirm={() => {
            templateActions.remove(pending.entry.id);
            close();
          }}
          onCancel={close}
        />
      )}
    </section>
  );
};
