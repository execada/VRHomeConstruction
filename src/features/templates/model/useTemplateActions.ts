/**
 * Управление своими шаблонами: переименование (на сервере меняется только название)
 * и удаление (сага шаблонов удаляет запись на сервере).
 * @module templates/model/useTemplateActions
 */

import { useCallback } from 'react';
import { useDispatch } from 'react-redux';
import { layoutsApi } from '@/app/api';
import { apiErrorText } from '@/app/api/errors';
import { CreateLayoutFeature } from '@/features/create-layout';
import { toast } from '@/shared/lib/toast';

export function useTemplateActions() {
  const dispatch = useDispatch();

  /** Переименовать шаблон; true — успешно. */
  const rename = useCallback(
    async (id: string, name: string): Promise<boolean> => {
      try {
        dispatch(CreateLayoutFeature.actions.upsertLayout(await layoutsApi.updateLayout(id, { name })));
        toast.success('Шаблон переименован');
        return true;
      } catch (error) {
        console.error('Не удалось переименовать шаблон', error);
        toast.error(apiErrorText(error, 'Не удалось переименовать шаблон'));
        return false;
      }
    },
    [dispatch],
  );

  const remove = useCallback(
    (id: string) => {
      dispatch(CreateLayoutFeature.actions.removeLayout(id));
      toast.info('Шаблон удалён');
    },
    [dispatch],
  );

  return { rename, remove };
}
