/**
 * Диалог изменения названия, описания и тегов проекта.
 * @module widgets/project-board/ui/EditProjectDialog
 */

import React, { useId, useState } from 'react';
import type { Project } from '@/features/create-project/types';
import { MAX_TAGS, validateProjectMeta, type ProjectMeta } from '@/features/project-actions';
import { Button, TextField } from '@/shared/ui/controls';
import { Dialog } from '@/shared/ui/overlay/Dialog';
import styles from './projectBoard.module.scss';

interface EditProjectDialogProps {
  project: Project;
  /** Сохранить; true — успешно (окно закрывается) */
  onSave: (meta: ProjectMeta) => Promise<boolean>;
  onClose: () => void;
}

export const EditProjectDialog: React.FC<EditProjectDialogProps> = ({ project, onSave, onClose }) => {
  const formId = useId();
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description ?? '');
  const [tags, setTags] = useState((project.tags ?? []).join(', '));
  const [errors, setErrors] = useState<Partial<Record<keyof ProjectMeta, string>>>({});
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = validateProjectMeta({ name, description, tags });
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    setBusy(true);
    const saved = await onSave(result.value);
    setBusy(false);
    if (saved) onClose();
  };

  return (
    <Dialog
      title="Проект"
      onClose={onClose}
      actions={
        <>
          <Button onClick={onClose}>Отмена</Button>
          <Button type="submit" form={formId} variant="primary" disabled={busy}>
            {busy ? 'Сохранение…' : 'Сохранить'}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={submit} noValidate className={styles.form}>
        <TextField label="Название" value={name} onChange={setName} error={errors.name} maxLength={120} autoFocus />
        <TextField
          label="Описание"
          value={description}
          onChange={setDescription}
          error={errors.description}
          maxLength={500}
          placeholder="Например: светлая гостиная для семьи из трёх человек"
          multiline
        />
        <TextField
          label="Теги"
          value={tags}
          onChange={setTags}
          error={errors.tags}
          hint={`Через запятую, до ${MAX_TAGS} тегов`}
          placeholder="лофт, кухня, светлый"
        />
      </form>
    </Dialog>
  );
};
