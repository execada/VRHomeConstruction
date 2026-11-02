import { describe, expect, it } from 'vitest';
import { layoutSchema, toProject, toProjectDetails, userSchema } from './schemas';

const raw = (extra: Record<string, unknown> = {}) => ({
  _id: 'p1',
  name: 'Гостиная',
  createdAt: '2026-01-01T00:00:00Z',
  status: 'active',
  ...extra,
});

describe('API schemas', () => {
  it('нормализует проект и заполняет значения по умолчанию', () => {
    const project = toProject(raw({ tags: null, status: 'weird' }));
    expect(project).toMatchObject({ id: 'p1', tags: [], favorite: false, description: '', thumbnail: '', status: 'active' });
  });

  it('пропускает только встроенные картинки в превью', () => {
    const ok = 'data:image/jpeg;base64,QUJD';
    expect(toProject(raw({ thumbnail: ok })).thumbnail).toBe(ok);
    expect(toProject(raw({ thumbnail: 'javascript:alert(1)' })).thumbnail).toBe('');
    expect(toProject(raw({ thumbnail: 'https://evil.example/x.png' })).thumbnail).toBe('');
    expect(toProject(raw({ thumbnail: 'data:image/svg+xml;base64,PHN2Zz4=' })).thumbnail).toBe('');
    expect(layoutSchema.parse({ _id: 'l1', name: 'x', thumbnail: 'data:text/html;base64,PGI+' }).thumbnail).toBe('');
  });

  it('полный проект содержит сцену и позу камеры', () => {
    const details = toProjectDetails(raw({ roomData: { a: 1 }, playerPosition: [1, 2, 3], playerRotation: [0, 1] }));
    expect(details.roomData).toEqual({ a: 1 });
    expect(details.playerPosition).toEqual([1, 2, 3]);
    expect(details.playerRotation).toBeNull();
  });

  it('отклоняет ответ без идентификатора', () => {
    expect(() => toProject({ name: 'x', createdAt: '2026-01-01' })).toThrow();
  });
});

describe('userSchema', () => {
  it('принимает администратора без почты, с логином и ролью', () => {
    const u = userSchema.parse({ id: 'a1', name: 'Админ', username: 'execada', role: 'admin' });
    expect(u).toMatchObject({ email: '', username: 'execada', role: 'admin' });
  });

  it('обычный пользователь — без логина и роли', () => {
    const u = userSchema.parse({ id: 'u1', name: 'Анна', email: 'anna@example.com' });
    expect(u.username).toBeUndefined();
    expect(u.role).toBeUndefined();
  });
});
