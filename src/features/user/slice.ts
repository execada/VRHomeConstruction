/**
 * Redux Slice пользователя и авторизации.
 * @module user/slice
 */

import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { AuthForm, AuthMode, AuthStep, User, UserState } from './types';

const emptyForm: AuthForm = {
  name: '',
  email: '',
  password: '',
  code: '',
};

const initialState: UserState = {
  authData: undefined,
  isAuth: false,
  isLoading: false,
  error: undefined,
  isAuthModalOpen: false,
  authMode: 'login',
  authStep: 'form',
  codeSent: false,
  successMessage: undefined,
  form: emptyForm,
  registrationToken: undefined,
};

export const { actions, name, reducer } = createSlice({
  name: 'user',
  initialState,
  reducers: {
    /** Установить данные авторизованного пользователя */
    setUser: (state, action: PayloadAction<User>) => {
      state.authData = action.payload;
      state.isAuth = true;
      state.isLoading = false;
      state.error = undefined;
      state.isAuthModalOpen = false;
      state.authStep = 'form';
      state.codeSent = false;
      state.successMessage = undefined;
      state.form = emptyForm;
      state.registrationToken = undefined;
    },
    /** Обновить данные профиля (смена имени/почты) без повторного входа */
    updateAuthData: (state, action: PayloadAction<User>) => {
      state.authData = action.payload;
    },
    /** Выйти из аккаунта */
    logout: (state) => {
      state.authData = undefined;
      state.isAuth = false;
      state.isLoading = false;
      state.error = undefined;
      state.authStep = 'form';
      state.codeSent = false;
      state.successMessage = undefined;
      state.form = emptyForm;
      state.registrationToken = undefined;
    },
    /** Индикатор загрузки */
    setLoading: (state, action: PayloadAction<boolean>) => {
      state.isLoading = action.payload;
    },
    /** Текст ошибки */
    setError: (state, action: PayloadAction<string | undefined>) => {
      state.error = action.payload;
      state.isLoading = false;
    },
    /** Открыть модалку входа или регистрации */
    openAuthModal: (state, action: PayloadAction<AuthMode>) => {
      state.isAuthModalOpen = true;
      state.authMode = action.payload;
      state.authStep = 'form';
      state.codeSent = false;
      state.successMessage = undefined;
      state.error = undefined;
      state.form = emptyForm;
      state.registrationToken = undefined;
    },
    /** Закрыть модалку авторизации */
    closeAuthModal: (state) => {
      state.isAuthModalOpen = false;
      state.authStep = 'form';
      state.codeSent = false;
      state.successMessage = undefined;
      state.error = undefined;
      state.form = emptyForm;
      state.registrationToken = undefined;
    },
    /** Переключить режим: вход / регистрация */
    setAuthMode: (state, action: PayloadAction<AuthMode>) => {
      state.authMode = action.payload;
      state.authStep = 'form';
      state.codeSent = false;
      state.successMessage = undefined;
      state.error = undefined;
      state.registrationToken = undefined;
    },
    /** Шаг: форма или ввод кода */
    setAuthStep: (state, action: PayloadAction<AuthStep>) => {
      state.authStep = action.payload;
      state.error = undefined;
    },
    /** Код отправлен на почту */
    setCodeSent: (state, action: PayloadAction<boolean>) => {
      state.codeSent = action.payload;
      if (action.payload) {
        state.authStep = 'code';
        if (!state.successMessage) {
          state.successMessage = 'Код отправлен! Проверьте почту (и папку «Спам»).';
        }
        state.error = undefined;
      }
    },
    /** Токен заявки на регистрацию (из ответа на отправку кода) */
    setRegistrationToken: (state, action: PayloadAction<string | undefined>) => {
      state.registrationToken = action.payload;
    },
    /** Сообщение после отправки кода */
    setSuccessMessage: (state, action: PayloadAction<string | undefined>) => {
      state.successMessage = action.payload;
    },
    /** Обновить поле формы */
    setFormField: (state, action: PayloadAction<{ field: keyof AuthForm; value: string }>) => {
      state.form[action.payload.field] = action.payload.value;
    },
    /** Войти по email и паролю (без кода) */
    loginRequested: () => {},
    /** Запросить код на email (регистрация) */
    sendCodeRequested: () => {},
    /** Подтвердить код и завершить регистрацию */
    verifyCodeRequested: () => {},
    /** Восстановить сессию по токену из localStorage */
    restoreSessionRequested: () => {},
  },
});
