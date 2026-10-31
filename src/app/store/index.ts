import { configureStore } from '@reduxjs/toolkit';
import createSagaMiddleware from 'redux-saga';
import { UserFeature } from '@/features/user';
import { SearchFeature } from '@/features/search';
import { ModalsFeature } from '@/features/modals';
import { UniversalButtonFeature } from '@/features/universal-button';
import { CreateProjectFeature } from '@/features/create-project';
import { CreateFolderFeature } from '@/features/create-folder';
import { FoldersFeature } from '@/features/folders';
import { CreateLayoutFeature } from '@/features/create-layout';
import { EnvironmentFeature } from '@/features/environment';
import { CameraFeature } from '@/features/camera';
import { GraphicsFeature } from '@/features/graphics';
import { SelectionFeature } from '@/features/selection';
import { HistoryFeature } from '@/features/history';
import { ThemeFeature } from '@/features/theme';
import { NotificationsFeature } from '@/features/notifications';
import { AssetsFeature } from '@/features/assets';
import { ProjectSessionFeature } from '@/features/project-session';
import { reducer as editorReducer } from '@/features/editor-3d/slice';
import { reducer as furnitureReducer } from '@/features/furniture/slice';
import { rootSaga } from './saga';

const sagaMiddleware = createSagaMiddleware();

export const createReduxStore = () => {
  const store = configureStore({
    reducer: {
      ...UserFeature.reducer,
      ...CreateProjectFeature.reducer,
      ...SearchFeature.reducer,
      ...ModalsFeature.reducer,
      ...CreateFolderFeature.reducer,
      ...FoldersFeature.reducer,
      ...CreateLayoutFeature.reducer,
      ...UniversalButtonFeature.reducer,
      ...EnvironmentFeature.reducer,
      ...CameraFeature.reducer,
      ...GraphicsFeature.reducer,
      ...SelectionFeature.reducer,
      ...HistoryFeature.reducer,
      ...ThemeFeature.reducer,
      ...NotificationsFeature.reducer,
      ...AssetsFeature.reducer,
      ...ProjectSessionFeature.reducer,
      editor: editorReducer,
      furniture: furnitureReducer,
    },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({
        thunk: false,
        // Снимки истории — большие неизменяемые документы; полная проверка на каждое
        // действие при перетаскивании заметно тормозит dev-сборку.
        immutableCheck: { ignoredPaths: ['history'] },
        serializableCheck: { ignoredPaths: ['history'] },
      }).concat(sagaMiddleware),
    devTools: process.env.NODE_ENV !== 'production',
  });
  sagaMiddleware.run(rootSaga);
  return store;
};

export type RootState = ReturnType<ReturnType<typeof createReduxStore>['getState']>;
