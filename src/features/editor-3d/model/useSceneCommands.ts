/**
 * React-хук команд сцены (см. {@link createSceneCommands}).
 * Команды создаются один раз на store и читают состояние в момент вызова.
 * @module editor-3d/model/useSceneCommands
 */

import { useMemo } from 'react';
import { useStore } from 'react-redux';
import type { RootState } from '@/app/store';
import { toast } from '@/shared/lib/toast';
import { createSceneCommands, type SceneCommands } from './commands';

/** Команды изменения сцены. */
export function useSceneCommands(): SceneCommands {
  const store = useStore<RootState>();
  return useMemo(
    () => createSceneCommands({ getState: store.getState, dispatch: store.dispatch, notify: toast.info }),
    [store],
  );
}
