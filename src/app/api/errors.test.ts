import { describe, expect, it } from 'vitest';
import { ApiRequestError } from './client';
import { apiErrorText, knownErrorText } from './errors';

describe('apiErrorText', () => {
  it('переводит известные коды сервера', () => {
    expect(apiErrorText(new ApiRequestError(401, 'invalid verification code'), 'x')).toBe('Неверный код подтверждения');
    expect(apiErrorText(new ApiRequestError(409, 'Email already registered'), 'x')).toBe('Эта почта уже зарегистрирована');
  });

  it('оставляет сетевые ошибки клиента как есть', () => {
    expect(apiErrorText(new ApiRequestError(0, 'Нет связи с сервером'), 'x')).toBe('Нет связи с сервером');
  });

  it('обобщает неизвестные ошибки по статусу', () => {
    expect(apiErrorText(new ApiRequestError(401, 'weird'), 'x')).toBe('Войдите в аккаунт, чтобы продолжить');
    expect(apiErrorText(new ApiRequestError(429, 'weird'), 'x')).toContain('Слишком много запросов');
    expect(apiErrorText(new ApiRequestError(413, 'weird'), 'x')).toContain('слишком большой');
    expect(apiErrorText(new ApiRequestError(503, 'db down'), 'x')).toBe('Сервер временно недоступен, попробуйте позже');
  });

  it('не раскрывает технические тексты 4xx и чужие ошибки', () => {
    expect(apiErrorText(new ApiRequestError(400, "json: cannot unmarshal string into Go struct field"), 'Не удалось')).toBe('Не удалось');
    expect(apiErrorText(new Error('boom'), 'Не удалось')).toBe('Не удалось');
    expect(apiErrorText('boom', 'Не удалось')).toBe('Не удалось');
  });

  it('переводит ответы с параметрами и имена полей', () => {
    expect(knownErrorText('invalid field: token')).toBe('Запросите код подтверждения ещё раз');
    expect(knownErrorText('invalid field: newEmail')).toBe('Введите корректный адрес почты');
    expect(knownErrorText('invalid field: purpose')).toBe('Проверьте заполнение формы');
    expect(knownErrorText('name must be between 1 and 80 characters')).toBe('Название — от 1 до 80 символов');
    expect(knownErrorText('project limit of 500 reached — delete unused projects')).toBe('Достигнут лимит в 500 проектов — удалите ненужные');
    expect(knownErrorText('camera pose must contain exactly 3 numbers')).toContain('положение камеры');
    expect(knownErrorText('projectIds contains an invalid id')).toContain('папку');
  });

  it('переводит ответы проверки пароля и входа', () => {
    expect(apiErrorText(new ApiRequestError(403, 'invalid password'), 'x')).toBe('Неверный пароль');
    expect(apiErrorText(new ApiRequestError(429, 'too many login attempts, try again later'), 'x')).toContain('15 минут');
    expect(apiErrorText(new ApiRequestError(400, 'invalid JSON body'), 'x')).toContain('обновите страницу');
  });

  it('переводит ответы восстановления пароля', () => {
    expect(apiErrorText(new ApiRequestError(429, 'too many password reset attempts, try again later'), 'x')).toBe(
      'Слишком много неверных кодов — попробуйте через час',
    );
    expect(apiErrorText(new ApiRequestError(400, 'password must be at least 6 characters'), 'x')).toBe('Пароль должен быть не короче 6 символов');
    expect(apiErrorText(new ApiRequestError(400, 'invalid field: code'), 'x')).toBe('Код — 6 цифр из письма');
  });

  it('knownErrorText переводит только известные ответы', () => {
    expect(knownErrorText('Invalid email or password ')).toBe('Неверная почта или пароль');
    expect(knownErrorText('something else')).toBeUndefined();
  });
});
