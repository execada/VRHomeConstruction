/**
 * Redux Slice сессии проекта: открытие, статус сохранения, ручное сохранение.
 * Логика загрузки и автосохранения — в саге (project-session/saga).
 * @module project-session/slice
 */

import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { ProjectSessionState, SaveState } from './types';

const initialState: ProjectSessionState = {
  projectId: null,
  status: 'idle',
  error: null,
  saveState: 'saved',
  lastSavedAt: null,
  fromLocalBackup: false,
  unsavedKept: false,
};

export const { actions, name, reducer } = createSlice({
  name: 'projectSession',
  initialState,
  reducers: {
    /** Открыть проект (сага загрузит и применит сцену) */
    openRequested: (_state, action: PayloadAction<string>) => ({ ...initialState, projectId: action.payload, status: 'loading' }),
    /** Проект открыт */
    opened: (state, action: PayloadAction<{ fromLocalBackup: boolean }>) => {
      state.status = 'ready';
      state.fromLocalBackup = action.payload.fromLocalBackup;
      state.saveState = action.payload.fromLocalBackup ? 'dirty' : 'saved';
    },
    /** Не удалось открыть проект */
    openFailed: (state, action: PayloadAction<string>) => {
      state.status = 'error';
      state.error = action.payload;
    },
    /** Статус сохранения */
    setSaveState: (state, action: PayloadAction<SaveState>) => {
      state.saveState = action.payload;
    },
    /** Успешно сохранено */
    saved: (state, action: PayloadAction<string>) => {
      state.saveState = 'saved';
      state.lastSavedAt = action.payload;
      state.fromLocalBackup = false;
    },
    /** Сохранить сейчас (Ctrl+S, кнопка, VR-меню) */
    saveNowRequested: () => {},
    /** Сделать превью проекта, если его ещё нет (после первой загрузки сцены) */
    thumbnailRequested: () => {},
    /** Закрыть проект (сохранить изменения и очистить сцену) */
    closeRequested: () => {},
    /**
     * Нет входа (вышли из аккаунта, сессия закончилась или проект открыли без входа): сцена
     * закрыта, страница просит войти, после входа проект откроется снова.
     */
    signedOut: (state, action: PayloadAction<{ unsavedKept: boolean }>) => ({
      ...initialState,
      projectId: state.projectId,
      status: 'signedOut',
      unsavedKept: action.payload.unsavedKept,
    }),
    /** Сбросить сессию */
    resetSession: () => initialState,
  },
});

export type { ProjectSessionState };
