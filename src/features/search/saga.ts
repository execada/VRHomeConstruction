/**
 * Саги для поиска.
 * Выполняют поиск по проектам, макетам и папкам при изменении запроса.
 * @module search/saga
 */

import { takeLatest, put, select, all } from 'typed-redux-saga';
import { SearchFeature } from '@/features/search';  
import { CreateProjectFeature } from '@/features/create-project';
import { CreateLayoutFeature } from '@/features/create-layout';
import { FoldersFeature } from '@/features/folders';
import type { Project } from '@/features/create-project/types';
import type { Layout } from '@/features/create-layout/types';
import type { Folder } from '@/features/folders/types';

function* handleSearch() {
  try {
    const query: string = yield* select(SearchFeature.selectors.selectSearchQuery);
    const trimmed = query.trim().toLowerCase();

    if (!trimmed) {
      yield put(SearchFeature.actions.setHighlightedIds([]));
      yield put(SearchFeature.actions.setHighlightedFolderIds([]));
      yield put(SearchFeature.actions.setSearchResults([]));
      return;
    }

    const projects: Project[] = yield* select(CreateProjectFeature.selectors.selectProjects);
    const layouts: Layout[] = yield* select(CreateLayoutFeature.selectors.selectLayouts);
    const folders: Folder[] = yield* select(FoldersFeature.selectors.selectFolders);

    const projectIds = projects
      .filter(p => p.name.toLowerCase().includes(trimmed))
      .map(p => p.id);
    const layoutIds = layouts
      .filter(l => l.name.toLowerCase().includes(trimmed))
      .map(l => l.id);
    const folderIds = folders
      .filter(f => f.name.toLowerCase().includes(trimmed))
      .map(f => f.id);

    const combinedIds = [...projectIds, ...layoutIds];

    yield put(SearchFeature.actions.setHighlightedIds(combinedIds));
    yield put(SearchFeature.actions.setHighlightedFolderIds(folderIds));

    const allResults = [...combinedIds, ...folderIds];
    yield put(SearchFeature.actions.setSearchResults(allResults));
  } catch (error: any) {
    console.error('Search saga error:', error);
  }
}

export function* initSaga() {
  yield all([
    takeLatest(SearchFeature.actions.setSearchQuery.type, handleSearch),
  ]);
}