import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { readStored, writeStored } from './storage';

function memoryStorage(overrides: Partial<Storage> = {}): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (k) => data.get(k) ?? null,
    key: (i) => [...data.keys()][i] ?? null,
    removeItem: (k) => void data.delete(k),
    setItem: (k, v) => void data.set(k, String(v)),
    ...overrides,
  };
}

const schema = z.object({ mode: z.enum(['a', 'b']) });

describe('storage', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('без window возвращает значение по умолчанию и ничего не пишет', () => {
    expect(readStored('x', schema, { mode: 'a' })).toEqual({ mode: 'a' });
    expect(() => writeStored('x', { mode: 'b' })).not.toThrow();
  });

  it('записывает с префиксом и читает с проверкой схемы', () => {
    const ls = memoryStorage();
    vi.stubGlobal('window', { localStorage: ls });
    writeStored('x', { mode: 'b' });
    expect(ls.getItem('vrhc:x')).toBe('{"mode":"b"}');
    expect(readStored('x', schema, { mode: 'a' })).toEqual({ mode: 'b' });
  });

  it('повреждённые или чужие данные заменяются значением по умолчанию', () => {
    const ls = memoryStorage();
    vi.stubGlobal('window', { localStorage: ls });
    ls.setItem('vrhc:bad-json', '{oops');
    ls.setItem('vrhc:bad-shape', '{"mode":"c"}');
    expect(readStored('bad-json', schema, { mode: 'a' })).toEqual({ mode: 'a' });
    expect(readStored('bad-shape', schema, { mode: 'a' })).toEqual({ mode: 'a' });
    expect(readStored('missing', schema, { mode: 'a' })).toEqual({ mode: 'a' });
  });

  it('переполнение хранилища не прерывает работу', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.stubGlobal('window', {
      localStorage: memoryStorage({
        setItem: () => {
          throw new Error('QuotaExceededError');
        },
      }),
    });
    expect(() => writeStored('x', { mode: 'a' })).not.toThrow();
    expect(warn).toHaveBeenCalled();
  });

  it('недоступный localStorage (приватный режим) не ломает чтение', () => {
    vi.stubGlobal('window', {
      get localStorage() {
        throw new Error('SecurityError');
      },
    });
    expect(readStored('x', schema, { mode: 'a' })).toEqual({ mode: 'a' });
  });
});
