/**
 * Корень приложения: текущая страница и глобальные окна (вход, создание папки, уведомления-тосты).
 * Оболочка с боковой панелью подключается в роутере только для страниц вне редактора.
 * @module app/App
 */

import React from 'react';
import { Outlet } from 'react-router-dom';
import { Modals } from '@/features/modals/ui/Modals';
import { AuthModal } from '@/features/user';
import { Toaster } from '@/shared/ui/toast/Toaster';

export const App = () => (
  <div className="app">
    <Outlet />
    <Modals />
    <AuthModal />
    <Toaster />
  </div>
);
