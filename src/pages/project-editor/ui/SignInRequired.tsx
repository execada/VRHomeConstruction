/**
 * Страница проекта без входа: сессия закончилась (выход, смена пароля на другом устройстве)
 * или проект открыли по ссылке, не войдя. После входа проект откроется сам — вместе
 * с несохранёнными правками из локальной копии.
 * @module pages/project-editor/ui/SignInRequired
 */

import React from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Link } from 'react-router-dom';
import { ProjectSessionFeature } from '@/features/project-session';
import { UserFeature } from '@/features/user';
import { Button } from '@/shared/ui/controls';
import styles from './ProjectEditorPage.module.scss';

export const SignInRequired: React.FC = () => {
  const dispatch = useDispatch();
  const unsavedKept = useSelector(ProjectSessionFeature.selectors.selectUnsavedKept);

  return (
    <div className={styles.state} role="status">
      <span className={styles.stateTitle}>Войдите, чтобы открыть проект</span>
      {unsavedKept && <span>Несохранённые изменения остались на этом устройстве — после входа они вернутся в проект.</span>}
      <Button variant="primary" onClick={() => dispatch(UserFeature.actions.openAuthModal('login'))}>
        Войти
      </Button>
      <Link to="/">Вернуться к проектам</Link>
    </div>
  );
};
