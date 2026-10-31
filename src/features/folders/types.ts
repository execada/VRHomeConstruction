/**
 * Типы для фичи папок (полная версия).
 * @module folders/types
 */

export interface Folder {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
  projectIds: string[];
  layoutIds: string[];
  childFolderIds: string[];
  parentId: string | null;
}

export interface FoldersState {
  folders: Folder[];
  isLoading: boolean;
  error: string | null;
  activeMenuId: string | null;
  activeFolderId: string | null;
}