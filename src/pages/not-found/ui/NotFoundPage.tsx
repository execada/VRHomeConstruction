/**
 * Страница 404 внутри оболочки приложения.
 * @module pages/not-found/ui/NotFoundPage
 */

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/shared/ui/controls';
import { EmptyState } from '@/shared/ui/empty-state/EmptyState';

export const NotFoundPage = () => {
  const navigate = useNavigate();
  return (
    <EmptyState
      title="Страница не найдена"
      text="Возможно, ссылка устарела или в адресе опечатка."
      actions={
        <Button variant="primary" icon="home" onClick={() => navigate('/')}>
          К моим проектам
        </Button>
      }
    />
  );
};
