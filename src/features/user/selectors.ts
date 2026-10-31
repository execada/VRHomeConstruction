/**
 * Селекторы фичи пользователя.
 * @module user/selectors
 */

import { createSelector } from '@reduxjs/toolkit';
import { name } from './slice';
import { UserState } from './types';

type State = {
  [name]: UserState;
};

const root = (state: State) => state[name];

const selectUserAuthData = createSelector(root, (user) => user?.authData);
const selectUserIsAuth = createSelector(root, (user) => user?.isAuth ?? false);
const selectUserIsLoading = createSelector(root, (user) => user?.isLoading ?? false);
const selectUserError = createSelector(root, (user) => user?.error);
const selectUserName = createSelector(root, (user) => user?.authData?.name);
const selectUserEmail = createSelector(root, (user) => user?.authData?.email);
const selectUserAvatar = createSelector(root, (user) => user?.authData?.avatar);
const selectIsAuthModalOpen = createSelector(root, (user) => user?.isAuthModalOpen ?? false);
const selectAuthMode = createSelector(root, (user) => user?.authMode ?? 'login');
const selectAuthForm = createSelector(
  root,
  (user) => user?.form ?? { name: '', email: '', password: '', code: '' },
);
const selectAuthStep = createSelector(root, (user) => user?.authStep ?? 'form');
const selectCodeSent = createSelector(root, (user) => user?.codeSent ?? false);
const selectSuccessMessage = createSelector(root, (user) => user?.successMessage);
const selectRegistrationToken = createSelector(root, (user) => user?.registrationToken);

export const selectors = {
  selectUserAuthData,
  selectUserIsAuth,
  selectUserIsLoading,
  selectUserError,
  selectUserName,
  selectUserEmail,
  selectUserAvatar,
  selectIsAuthModalOpen,
  selectAuthMode,
  selectAuthForm,
  selectAuthStep,
  selectCodeSent,
  selectSuccessMessage,
  selectRegistrationToken,
};
