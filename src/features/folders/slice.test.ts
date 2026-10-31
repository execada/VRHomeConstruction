import { describe, expect, it } from 'vitest';
import { actions, reducer } from './slice';
import type { Folder } from './types';

const folder = (id: string): Folder => ({
  id,
  name: `Папка ${id}`,
  createdAt: '2026-01-01T00:00:00Z',
  projectIds: [],
  layoutIds: [],
  childFolderIds: [],
  parentId: null,
});

const initial = () => reducer(undefined, { type: 'init' });

describe('folders slice', () => {
  it('добавляет без дублей, переименовывает и удаляет', () => {
    let state = reducer(initial(), actions.addFolder(folder('f1')));
    state = reducer(state, actions.addFolder(folder('f1')));
    expect(state.folders).toHaveLength(1);
    state = reducer(state, actions.renameFolder({ folderId: 'f1', name: 'Квартира' }));
    expect(state.folders[0].name).toBe('Квартира');
    state = reducer(state, actions.removeFolder('f1'));
    expect(state.folders).toHaveLength(0);
  });

  it('проекты, шаблоны и вложенные папки без повторов', () => {
    let state = reducer(initial(), actions.addFolder(folder('f1')));
    const twice = <T,>(action: T) => [action, action];
    for (const action of [
      ...twice(actions.addProjectToFolder({ folderId: 'f1', projectId: 'p1' })),
      ...twice(actions.addLayoutToFolder({ folderId: 'f1', layoutId: 'l1' })),
      ...twice(actions.addFolderToFolder({ parentFolderId: 'f1', childFolderId: 'f2' })),
    ]) {
      state = reducer(state, action);
    }
    expect(state.folders[0]).toMatchObject({ projectIds: ['p1'], layoutIds: ['l1'], childFolderIds: ['f2'] });

    state = reducer(state, actions.removeProjectFromFolder({ folderId: 'f1', projectId: 'p1' }));
    state = reducer(state, actions.removeLayoutFromFolder({ folderId: 'f1', layoutId: 'l1' }));
    state = reducer(state, actions.removeFolderFromFolder({ parentFolderId: 'f1', childFolderId: 'f2' }));
    expect(state.folders[0]).toMatchObject({ projectIds: [], layoutIds: [], childFolderIds: [] });
  });

  it('действия с несуществующей папкой ничего не ломают', () => {
    const state = initial();
    expect(reducer(state, actions.addProjectToFolder({ folderId: 'x', projectId: 'p' }))).toEqual(state);
    expect(reducer(state, actions.removeProjectFromFolder({ folderId: 'x', projectId: 'p' }))).toEqual(state);
    expect(reducer(state, actions.addLayoutToFolder({ folderId: 'x', layoutId: 'l' }))).toEqual(state);
    expect(reducer(state, actions.removeLayoutFromFolder({ folderId: 'x', layoutId: 'l' }))).toEqual(state);
    expect(reducer(state, actions.addFolderToFolder({ parentFolderId: 'x', childFolderId: 'y' }))).toEqual(state);
    expect(reducer(state, actions.removeFolderFromFolder({ parentFolderId: 'x', childFolderId: 'y' }))).toEqual(state);
  });

  it('служебные поля и сброс', () => {
    let state = reducer(initial(), actions.setFoldersLoading(true));
    state = reducer(state, actions.setFoldersError('Ошибка'));
    state = reducer(state, actions.setActiveMenuId('f1'));
    state = reducer(state, actions.setActiveFolderId('f1'));
    expect(state).toMatchObject({ isLoading: true, error: 'Ошибка', activeMenuId: 'f1', activeFolderId: 'f1' });
    expect(reducer(state, actions.resetFolders())).toEqual(initial());
  });
});
