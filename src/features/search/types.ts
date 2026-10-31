/**
 * Типы для фичи поиска.
 * @module search/types
 */

export interface SearchState {
  query: string;
  isSearching: boolean;
  results: string[];
  foundProjectId: string | null;
  highlightedIds: string[];
  highlightedFolderIds: string[];
  inputValue: string;
  activeMenuId: string | null;
}