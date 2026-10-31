import { getStoredToken } from './token';

const BASE_URL = '';

interface ApiError {
  error: string;
}

export class ApiRequestError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

const REQUEST_TIMEOUT_MS = 20000;

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    // Пропускаем предупреждающую страницу ngrok при доступе через публичную ссылку.
    // Запросы идут на тот же origin, что и страница, поэтому CORS не затрагивается.
    'ngrok-skip-browser-warning': 'true',
    ...(options?.headers as Record<string, string>),
  };

  const token = getStoredToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      ...options,
      headers,
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new ApiRequestError(
        0,
        'Сервер не ответил вовремя. Проверьте, что бэкенд запущен (docker compose up).',
      );
    }
    throw new ApiRequestError(0, 'Нет связи с сервером. Запустите бэкенд на порту 8080.');
  } finally {
    clearTimeout(timeoutId);
  }

  if (!res.ok) {
    const body: ApiError = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new ApiRequestError(res.status, body.error);
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}

function mapProject(p: any) {
  return { ...p, id: p._id, _id: undefined };
}

function mapFolder(f: any) {
  return { ...f, id: f._id, _id: undefined };
}

function mapLayout(l: any) {
  return { ...l, id: l._id, _id: undefined };
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  put: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PUT', body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  del: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
  mapProject,
  mapFolder,
  mapLayout,
};
