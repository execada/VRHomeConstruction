/**
 * Диалог переименования папки.
 * @module widgets/folder-board/ui/RenameFolderDialog
 */

import React, { useId, useState } from 'react';
import { useDispatch } from 'react-redux';
import { z } from 'zod';
import { foldersActions } from '@/features/folders';
import type { Folder } from '@/features/folders/types';
import { Button, TextField } from '@/shared/ui/controls';
import { Dialog } from '@/shared/ui/overlay/Dialog';

const folderNameSchema = z.string().trim().min(1, 'Введите название').max(80, 'Название — не длиннее 80 символов');

export const RenameFolderDialog: React.FC<{ folder: Folder; onClose: () => void }> = ({ folder, onClose }) => {
  const dispatch = useDispatch();
  const formId = useId();
  const [name, setName] = useState(folder.name);
  const [error, setError] = useState<string | null>(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = folderNameSchema.safeParse(name);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Некорректное название');
      return;
    }
    if (parsed.data !== folder.name) dispatch(foldersActions.renameFolder({ folderId: folder.id, name: parsed.data }));
    onClose();
  };

  return (
    <Dialog
      title="Переименовать папку"
      onClose={onClose}
      actions={
        <>
          <Button onClick={onClose}>Отмена</Button>
          <Button type="submit" form={formId} variant="primary">
            Сохранить
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={submit} noValidate>
        <TextField label="Название" value={name} onChange={setName} error={error} maxLength={80} autoFocus />
      </form>
    </Dialog>
  );
};
