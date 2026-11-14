import { isSessionRejection, rejectSession } from './session';
import { getStoredToken } from './token';

const BASE_URL = '';

interface ApiError {
  error: string;
}

export class ApiRequestError extends Error {
  constructor(
    public status: number,
    message: string,
    /**
     * Сервер отклонил токен запроса (срок вышел или сессию отозвали): сессия этого запроса
     * закончилась, выход по ней выполнен — этим ответом или раньше. Повторять запрос с более
     * новым токеном нельзя: это была бы уже другая сессия (возможно, другого пользователя).
     */
    public readonly sessionEnded = false,
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

const REQUEST_TIMEOUT_MS = 20000;

/** Текст ошибки из ответа сервера `{ error: "…" }`; без него (например, ответ прокси) — «HTTP <код>». */
function errorMessage(body: unknown, status: number): string {
  const error = (body as Partial<ApiError> | null)?.error;
  return typeof error === 'string' ? error : `HTTP ${status}`;
}

/**
 * Ошибка ответа. Отказ в сессии на запрос, ушедший с токеном, ещё и заканчивает сессию
 * (токен стирается, сага пользователя выходит из аккаунта — см. app/api/session). Запросы
 * без токена (вход, регистрация, сброс пароля) так не заканчиваются никогда.
 * @param status - HTTP-статус
 * @param message - текст ошибки сервера
 * @param token - токен, с которым ушёл запрос
 */
function responseError(status: number, message: string, token: string | null): ApiRequestError {
  const sessionEnded = token !== null && isSessionRejection(status, message);
  if (sessionEnded) rejectSession(token);
  return new ApiRequestError(status, message, sessionEnded);
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    // Пропускаем предупреждающую страницу ngrok при доступе через публичную ссылку.
    // Запросы идут на тот же origin, что и страница, поэтому CORS не затрагивается.
    'ngrok-skip-browser-warning': 'true',
    ...(options?.headers as Record<string, string>),
  };

  const token = getStoredToken() || null;
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
    const body: unknown = await res.json().catch(() => null);
    throw responseError(res.status, errorMessage(body, res.status), token);
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
