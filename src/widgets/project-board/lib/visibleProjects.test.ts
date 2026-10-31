import { describe, expect, it } from 'vitest';
import type { Project } from '@/features/create-project/types';
import { projectSubtitle, visibleProjects } from './visibleProjects';

const project = (id: string, extra: Partial<Project> = {}): Project => ({
  id,
  name: `Проект ${id}`,
  status: 'active',
  createdAt: '2026-01-01T00:00:00Z',
  ...extra,
});

const projects = [
  project('a', { updatedAt: '2026-03-01T00:00:00Z', tags: ['кухня'] }),
  project('b', { updatedAt: '2026-05-01T00:00:00Z', favorite: true, description: 'Светлая гостиная' }),
  project('c', { createdAt: '2026-04-01T00:00:00Z' }),
];

describe('visibleProjects', () => {
  it('сортирует по времени изменения (свежие сверху)', () => {
    expect(visibleProjects(projects, { favoritesOnly: false, query: '' }).map((p) => p.id)).toEqual(['b', 'c', 'a']);
  });

  it('вкладка «Избранное»', () => {
    expect(visibleProjects(projects, { favoritesOnly: true, query: '' }).map((p) => p.id)).toEqual(['b']);
  });

  it('ищет по названию, описанию и тегам', () => {
    expect(visibleProjects(projects, { favoritesOnly: false, query: 'КУХНЯ' }).map((p) => p.id)).toEqual(['a']);
    expect(visibleProjects(projects, { favoritesOnly: false, query: 'гостин' }).map((p) => p.id)).toEqual(['b']);
    expect(visibleProjects(projects, { favoritesOnly: false, query: 'проект c' }).map((p) => p.id)).toEqual(['c']);
  });

  it('не меняет исходный массив', () => {
    const copy = [...projects];
    visibleProjects(projects, { favoritesOnly: false, query: '' });
    expect(projects).toEqual(copy);
  });

  it('некорректная дата не ломает сортировку', () => {
    const list = [project('x', { createdAt: 'bad' }), project('y')];
    expect(visibleProjects(list, { favoritesOnly: false, query: '' }).map((p) => p.id)).toEqual(['y', 'x']);
  });
});

describe('projectSubtitle', () => {
  it('теги и описание через разделитель', () => {
    expect(projectSubtitle(project('a', { tags: ['лофт', 'уют'], description: ' Светлая ' }))).toBe('#лофт #уют · Светлая');
    expect(projectSubtitle(project('a'))).toBe('');
  });
});
