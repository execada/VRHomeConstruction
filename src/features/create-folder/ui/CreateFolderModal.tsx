/**
 * Модальное окно создания папки (новый дизайн; состояние и создание — прежние слайс и сага).
 * @module create-folder/ui/CreateFolderModal
 */

import React, { useId } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { ModalsFeature } from '@/features/modals';
import { Button, TextField } from '@/shared/ui/controls';
import { Dialog } from '@/shared/ui/overlay/Dialog';
import { actions } from '../slice';
import { selectors } from '../selectors';

export const CreateFolderModal = () => {
  const dispatch = useDispatch();
  const formId = useId();
  const isModalOpen = useSelector(ModalsFeature.selectors.selectIsCreateFolderModalOpen);
  const folderName = useSelector(selectors.selectFolderName);
  const isLoading = useSelector(selectors.selectIsLoading);
  const error = useSelector(selectors.selectError);

  if (!isModalOpen) return null;

  const handleClose = () => {
    dispatch(ModalsFeature.actions.closeCreateFolderModal());
    dispatch(actions.resetForm());
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    dispatch(actions.createFolderRequested());
  };

  return (
    <Dialog
      title="Новая папка"
      onClose={handleClose}
      actions={
        <>
          <Button onClick={handleClose} disabled={isLoading}>
            Отмена
          </Button>
          <Button type="submit" form={formId} variant="primary" disabled={!folderName.trim() || isLoading}>
            {isLoading ? 'Создание…' : 'Создать папку'}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={handleSubmit} noValidate>
        <TextField
          label="Название папки"
          value={folderName}
          onChange={(value) => dispatch(actions.setFolderName(value))}
          error={error}
          placeholder="Например: Квартира на Ленина"
          maxLength={80}
          disabled={isLoading}
          autoFocus
        />
      </form>
    </Dialog>
  );
};
