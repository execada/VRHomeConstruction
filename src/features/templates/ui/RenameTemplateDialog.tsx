/**
 * Диалог переименования своего шаблона.
 * @module templates/ui/RenameTemplateDialog
 */

import React, { useId, useState } from 'react';
import { z } from 'zod';
import { Button, TextField } from '@/shared/ui/controls';
import { Dialog } from '@/shared/ui/overlay/Dialog';

const nameSchema = z.string().trim().min(1, 'Введите название').max(120, 'Название — не длиннее 120 символов');

interface RenameTemplateDialogProps {
  currentName: string;
  /** Сохранить; true — успешно (окно закрывается) */
  onSave: (name: string) => Promise<boolean>;
  onClose: () => void;
}

export const RenameTemplateDialog: React.FC<RenameTemplateDialogProps> = ({ currentName, onSave, onClose }) => {
  const formId = useId();
  const [name, setName] = useState(currentName);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = nameSchema.safeParse(name);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Некорректное название');
      return;
    }
    if (parsed.data === currentName) {
      onClose();
      return;
    }
    setBusy(true);
    const saved = await onSave(parsed.data);
    setBusy(false);
    if (saved) onClose();
  };

  return (
    <Dialog
      title="Переименовать шаблон"
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
      <form id={formId} onSubmit={submit} noValidate>
        <TextField label="Название" value={name} onChange={setName} error={error} maxLength={120} autoFocus />
      </form>
    </Dialog>
  );
};
