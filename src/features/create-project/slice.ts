/**
 * Redux Slice для создания проектов.
 * Управляет формой, списком проектов и процессом создания.
 * @module create-project/slice
 */

import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { Project, ProjectsStatus } from './types';

export interface CreateProjectState {
  projectName: string;
  isLoading: boolean;
  error: string | null;
  projects: Project[];
  /** Статус загрузки списка проектов с сервера */
  projectsStatus: ProjectsStatus;
}

const initialState: CreateProjectState = {
  projectName: '',
  isLoading: false,
  error: null,
  projects: [],
  projectsStatus: 'idle',
};

export const { actions, name, reducer } = createSlice({
  name: 'createProject',
  initialState,
  reducers: {
    /** Установить название проекта */
    setProjectName: (state, action: PayloadAction<string>) => {
      state.projectName = action.payload;
      state.error = null;
    },
    /** Установить флаг загрузки */
    setIsLoading: (state, action: PayloadAction<boolean>) => {
      state.isLoading = action.payload;
    },
    /** Установить ошибку */
    setError: (state, action: PayloadAction<string | null>) => {
      state.error = action.payload;
      state.isLoading = false;
    },
    /** Сбросить форму */
    resetForm: (state) => {
      state.projectName = '';
      state.isLoading = false;
      state.error = null;
    },
    /** Запрос на создание проекта (сага) */
    createProjectRequested: () => {},

    /** Сбросить состояние (смена пользователя) */
    resetProjects: () => initialState,
    /** Добавить проект в список */
    addProject: (state, action: PayloadAction<Project>) => {
      state.projects.push(action.payload);
    },
    /** Удалить проект по id */
    removeProject: (state, action: PayloadAction<string>) => {
      state.projects = state.projects.filter(p => p.id !== action.payload);
    },
    /** Добавить или обновить проект (ответ сервера после сохранения/изменения) */
    upsertProject: (state, action: PayloadAction<Project>) => {
      const exists = state.projects.some(p => p.id === action.payload.id);
      state.projects = exists
        ? state.projects.map(p => (p.id === action.payload.id ? { ...p, ...action.payload } : p))
        : [action.payload, ...state.projects];
    },
    /** Убрать проект из списка после подтверждённого удаления на сервере (без повторного запроса) */
    removeProjectLocal: (state, action: PayloadAction<string>) => {
      state.projects = state.projects.filter(p => p.id !== action.payload);
    },
    /** Заменить список проектов (загрузка с сервера) */
    setProjects: (state, action: PayloadAction<Project[]>) => {
      state.projects = action.payload;
    },
    /** Установить статус загрузки списка */
    setProjectsStatus: (state, action: PayloadAction<ProjectsStatus>) => {
      state.projectsStatus = action.payload;
    },
    /** Запрос на (повторную) загрузку списка проектов (сага) */
    loadProjectsRequested: () => {},
  },
});