/**
 * Файл проекта (.vrhome.json): экспорт сцены на устройство и импорт из файла.
 * Файлы старого формата (v1) читаются: миграцию выполняет разбор документа сцены.
 * Содержимое файла — недоверенные данные: размер ограничен, структура проверяется.
 * @module shared/lib/projectFile
 */

import { z } from 'zod';

const APP_ID = 'vr-home-construction';
/** Версия формата файла. */
export const PROJECT_FILE_VERSION = 2;
/** Максимальный размер импортируемого файла. */
export const MAX_PROJECT_FILE_BYTES = 5 * 1024 * 1024;

/** Содержимое файла проекта. */
export interface ProjectFile {
  app: typeof APP_ID;
  version: number;
  name: string;
  savedAt: string;
  /** Документ сцены (проверяется при импорте) */
  roomData: unknown;
}

const fileSchema = z.object({
  app: z.literal(APP_ID),
  version: z.number().int().min(1).max(PROJECT_FILE_VERSION),
  name: z.string().max(200).catch('Импортированный проект'),
  savedAt: z.string().max(40).catch(''),
  roomData: z.record(z.string(), z.unknown()),
});

/** Собрать файл проекта. */
export function buildProjectFile(name: string, roomData: unknown): ProjectFile {
  return { app: APP_ID, version: PROJECT_FILE_VERSION, name, savedAt: new Date().toISOString(), roomData };
}

/** Безопасное имя файла из названия проекта. */
export function safeFileName(name: string, extension: string): string {
  const base = name.replace(/[^\p{L}\p{N}\-_ ]+/gu, '').trim().slice(0, 80) || 'project';
  return `${base}${extension}`;
}

/** Скачать данные как файл. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Преобразовать data URL (снимок сцены) в Blob без сетевого запроса. */
export function dataUrlToBlob(dataUrl: string): Blob {
  const [meta, data = ''] = dataUrl.split(',', 2);
  const mime = /^data:([^;]+)/.exec(meta)?.[1] ?? 'application/octet-stream';
  const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
  return new Blob([bytes], { type: mime });
}

/** Скачать файл проекта. */
export function downloadProjectFile(file: ProjectFile): void {
  downloadBlob(new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' }), safeFileName(file.name, '.vrhome.json'));
}

/**
 * Разобрать содержимое файла проекта.
 * @throws Error с понятным пользователю текстом
 */
export function parseProjectFile(text: string): ProjectFile {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('Файл повреждён: это не JSON');
  }
  const parsed = fileSchema.safeParse(data);
  if (!parsed.success) {
    const app = (data as { app?: unknown } | null)?.app;
    throw new Error(app === APP_ID ? 'Файл проекта повреждён или создан более новой версией' : 'Это не файл проекта VR Home');
  }
  return parsed.data;
}

/** Прочитать выбранный пользователем файл проекта. */
export async function readProjectFile(file: File): Promise<ProjectFile> {
  if (file.size > MAX_PROJECT_FILE_BYTES) throw new Error('Файл слишком большой (максимум 5 МБ)');
  return parseProjectFile(await file.text());
}
