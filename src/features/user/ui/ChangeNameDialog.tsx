/**
 * Диалог смены имени пользователя.
 * @module user/ui/ChangeNameDialog
 */

import React, { useId, useState } from 'react';
import { useDispatch } from 'react-redux';
import { authApi } from '@/app/api';
import { apiErrorText } from '@/app/api/errors';
import { toast } from '@/shared/lib/toast';
import { Button, TextField } from '@/shared/ui/controls';
import { Dialog } from '@/shared/ui/overlay/Dialog';
import { checkField, userNameSchema } from '../lib/profileSchemas';
import { actions } from '../slice';

export const ChangeNameDialog: React.FC<{ currentName: string; onClose: () => void }> = ({ currentName, onClose }) => {
  const dispatch = useDispatch();
  const [name, setName] = useState(currentName);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const formId = useId();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const checked = checkField(userNameSchema, name);
    if (!checked.ok) {
      setError(checked.error);
      return;
    }
    setBusy(true);
    try {
      dispatch(actions.updateAuthData(await authApi.updateProfile(checked.value)));
      toast.success('Имя изменено');
      onClose();
    } catch (err) {
      console.error('Не удалось сменить имя', err);
      setError(apiErrorText(err, 'Не удалось сменить имя'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      title="Сменить имя"
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
        <TextField label="Имя" value={name} onChange={setName} error={error} maxLength={60} autoComplete="name" autoFocus />
      </form>
    </Dialog>
  );
};
