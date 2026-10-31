import { describe, expect, it } from 'vitest';
import { checkField, emailSchema, userNameSchema, verificationCodeSchema } from './profileSchemas';

describe('profile schemas', () => {
  it('имя обрезается и ограничивается 60 символами', () => {
    expect(checkField(userNameSchema, '  Анна  ')).toEqual({ ok: true, value: 'Анна' });
    expect(checkField(userNameSchema, '   ')).toEqual({ ok: false, error: 'Введите имя' });
    expect(checkField(userNameSchema, 'я'.repeat(61)).ok).toBe(false);
  });

  it('почта нормализуется и проверяется', () => {
    expect(checkField(emailSchema, ' Anna@Mail.RU ')).toEqual({ ok: true, value: 'anna@mail.ru' });
    expect(checkField(emailSchema, 'not-an-email')).toEqual({ ok: false, error: 'Введите корректный адрес почты' });
    expect(checkField(emailSchema, `${'a'.repeat(250)}@x.ru`).ok).toBe(false);
  });

  it('код подтверждения — ровно 6 цифр', () => {
    expect(checkField(verificationCodeSchema, ' 123456 ')).toEqual({ ok: true, value: '123456' });
    expect(checkField(verificationCodeSchema, '12345').ok).toBe(false);
    expect(checkField(verificationCodeSchema, '12a456').ok).toBe(false);
  });

  it('не-строка даёт понятную ошибку', () => {
    const result = checkField(userNameSchema, 42);
    expect(result.ok).toBe(false);
  });
});
