/**
 * Типы для фичи модальных окон.
 * @module modals/types
 */

export interface ModalsState {
  isCreateProjectModalOpen: boolean;
  isCreateFolderModalOpen: boolean;
  isCreateLayoutModalOpen: boolean;
  projectCreationError: string | null; 
  folderCreationError: string | null;
  layoutCreationError: string | null; 
}