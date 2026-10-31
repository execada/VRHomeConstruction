/**
 * Redux Slice уведомлений: события приложения (сохранение, импорт, смена почты…).
 * Хранятся последние {@link NOTIFICATIONS_LIMIT} штук.
 * @module notifications/slice
 */

import { createSlice, nanoid, PayloadAction } from '@reduxjs/toolkit';
import { z } from 'zod';
import { readStored } from '@/shared/lib/storage';
import { AppNotification, NotificationKind, NotificationsState } from './types';

/** Ключ хранения уведомлений. */
export const NOTIFICATIONS_STORAGE_KEY = 'notifications';
/** Сколько уведомлений хранится. */
export const NOTIFICATIONS_LIMIT = 30;

const storedSchema = z.array(
  z.object({
    id: z.string().max(64),
    kind: z.enum(['info', 'success', 'warning']),
    title: z.string().max(200),
    message: z.string().max(500).optional(),
    createdAt: z.string().max(40),
    read: z.boolean(),
  }),
);

const initialState: NotificationsState = {
  items: readStored(NOTIFICATIONS_STORAGE_KEY, storedSchema, []).slice(0, NOTIFICATIONS_LIMIT),
};

export const { actions, name, reducer } = createSlice({
  name: 'notifications',
  initialState,
  reducers: {
    /** Добавить уведомление (новые — сверху) */
    pushNotification: {
      reducer: (state, action: PayloadAction<AppNotification>) => {
        state.items = [action.payload, ...state.items].slice(0, NOTIFICATIONS_LIMIT);
      },
      prepare: (payload: { kind?: NotificationKind; title: string; message?: string }) => ({
        payload: {
          id: nanoid(),
          kind: payload.kind ?? 'info',
          title: payload.title,
          message: payload.message,
          createdAt: new Date().toISOString(),
          read: false,
        },
      }),
    },
    /** Отметить все как прочитанные */
    markAllRead: (state) => {
      state.items = state.items.map((n) => ({ ...n, read: true }));
    },
    /** Удалить уведомление */
    dismissNotification: (state, action: PayloadAction<string>) => {
      state.items = state.items.filter((n) => n.id !== action.payload);
    },
    /** Очистить все */
    clearNotifications: (state) => {
      state.items = [];
    },
  },
});

export type { NotificationsState };
