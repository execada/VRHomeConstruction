/**
 * Состояние главной в адресной строке: вкладка (?tab=) и открытая папка (?folder=).
 * Ссылки вида /?tab=folders можно сохранить и отправить; неизвестные значения игнорируются.
 * @module pages/my-projects/model/useBoardParams
 */

import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { z } from 'zod';

export const boardTabSchema = z.enum(['all', 'favorites', 'folders']);
export type BoardTab = z.infer<typeof boardTabSchema>;

const folderIdSchema = z.string().regex(/^[\w-]{1,64}$/);

export function useBoardParams(): {
  tab: BoardTab;
  folderId: string | null;
  setTab: (tab: BoardTab) => void;
  openFolder: (folderId: string | null) => void;
} {
  const [params, setParams] = useSearchParams();
  const tab = boardTabSchema.catch('all').parse(params.get('tab') ?? 'all');
  const folderParam = folderIdSchema.safeParse(params.get('folder'));
  const folderId = tab === 'folders' && folderParam.success ? folderParam.data : null;

  const setTab = useCallback(
    (next: BoardTab) => setParams(next === 'all' ? {} : { tab: next }, { replace: true }),
    [setParams],
  );
  const openFolder = useCallback(
    (id: string | null) => setParams(id ? { tab: 'folders', folder: id } : { tab: 'folders' }),
    [setParams],
  );

  return { tab, folderId, setTab, openFolder };
}
