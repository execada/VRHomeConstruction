import React from 'react';
import ReactDOM from 'react-dom/client';
import { Provider } from 'react-redux';
import { RouterProvider } from 'react-router-dom';
import { createReduxStore } from './app/store';
import { router } from './app/router';
import { AppProviders } from './app/providers';
import './app/styles/index.scss';

const store = createReduxStore();

// Отладка в dev-сборке: состояние доступно из консоли браузера (в продакшен не попадает).
if (process.env.NODE_ENV === 'development') {
  void import('./features/editor-3d/model/interactionStore').then(({ interactionStore }) => {
    Object.assign(window, { __vrhc: { store, interactionStore } });
  });
}

const root = ReactDOM.createRoot(document.getElementById('root')!);

root.render(
  <React.StrictMode>
    <Provider store={store}>
      <AppProviders>
        <RouterProvider router={router} />
      </AppProviders>
    </Provider>
  </React.StrictMode>
);