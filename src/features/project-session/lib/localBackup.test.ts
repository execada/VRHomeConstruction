import { beforeEach, describe, expect, it, vi } from 'vitest';
import { hasUnsyncedBackup, isOwnBackup, markBackupSynced, readBackup, removeBackup, shouldPreferBackup, unsyncedBackup, writeBackup, type LocalBackup } from './localBackup';

function memoryStorage(): Storage {
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
  };
}

const at = (iso: string, extra: Partial<LocalBackup> = {}): LocalBackup => ({ roomData: {}, camera: null, savedAt: iso, synced: false, ...extra });

describe('local backup', () => {
  beforeEach(() => {
    vi.stubGlobal('window', { localStorage: memoryStorage() });
  });

  it('writes, reads and marks backups as synced', () => {
    writeBackup('p1', { roomData: { a: 1 }, camera: null, savedAt: '2026-01-01T00:00:00Z', synced: false });
    expect(readBackup('p1')?.roomData).toEqual({ a: 1 });
    markBackupSynced('p1');
    expect(readBackup('p1')?.synced).toBe(true);
    removeBackup('p1');
    expect(readBackup('p1')).toBeNull();
  });

  it('если localStorage не принял копию (квота), она хранится в памяти до перезагрузки', () => {
    const storage = memoryStorage();
    vi.stubGlobal('window', { localStorage: { ...storage, setItem: () => { throw new DOMException('full', 'QuotaExceededError'); } } });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    writeBackup('q1', at('2026-01-01T00:00:00Z', { roomData: { a: 2 }, userId: 'u1' }));

    expect(warn).toHaveBeenCalled();
    expect(readBackup('q1')).toMatchObject({ roomData: { a: 2 }, userId: 'u1' });
    expect(hasUnsyncedBackup('q1', 'u1')).toBe(true);
    expect(hasUnsyncedBackup('q1', 'u2'), 'чужая копия в памяти — тоже чужая').toBe(false);
    markBackupSynced('q1');
    expect(hasUnsyncedBackup('q1', 'u1')).toBe(false);
    expect(readBackup('q1')?.userId, 'отметка о синхронизации владельца не теряет').toBe('u1');
    removeBackup('q1');
    expect(readBackup('q1')).toBeNull();
    warn.mockRestore();
  });

  it('удачная запись заменяет копию из памяти', () => {
    const storage = memoryStorage();
    let full = true;
    vi.stubGlobal('window', {
      localStorage: { ...storage, setItem: (k: string, v: string) => (full ? (() => { throw new Error('full'); })() : storage.setItem(k, v)) },
    });
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    writeBackup('q2', { roomData: { v: 1 }, camera: null, savedAt: '2026-01-01T00:00:00Z', synced: false });

    full = false;
    writeBackup('q2', { roomData: { v: 2 }, camera: null, savedAt: '2026-01-02T00:00:00Z', synced: false });

    expect(readBackup('q2')?.roomData).toEqual({ v: 2 });
    expect(JSON.parse(storage.getItem('vrhc:backup:q2') ?? 'null')?.roomData).toEqual({ v: 2 });
    removeBackup('q2');
    vi.restoreAllMocks();
  });

  it('ignores corrupted backups', () => {
    window.localStorage.setItem('vrhc:backup:p2', '{not json');
    expect(readBackup('p2')).toBeNull();
    window.localStorage.setItem('vrhc:backup:p3', JSON.stringify({ roomData: 1, camera: 'x', savedAt: 1, synced: 'no' }));
    expect(readBackup('p3')).toBeNull();
  });

  it('копия с неверным владельцем считается повреждённой', () => {
    window.localStorage.setItem('vrhc:backup:p1', JSON.stringify({ ...at('2026-01-01T00:00:00Z'), userId: '' }));
    window.localStorage.setItem('vrhc:backup:p2', JSON.stringify({ ...at('2026-01-01T00:00:00Z'), userId: 42 }));

    expect(readBackup('p1')).toBeNull();
    expect(readBackup('p2')).toBeNull();
  });

  it('новая копия правок хранит id пользователя и в localStorage', () => {
    writeBackup('p1', unsyncedBackup({ a: 1 }, null, 'u1', new Date('2026-01-01T00:00:00Z')));

    expect(readBackup('p1')).toEqual({ roomData: { a: 1 }, camera: null, savedAt: '2026-01-01T00:00:00.000Z', synced: false, userId: 'u1' });
    expect(JSON.parse(window.localStorage.getItem('vrhc:backup:p1') ?? 'null')).toMatchObject({ userId: 'u1' });
  });

  it('копия без известного пользователя пишется без владельца', () => {
    const backup = unsyncedBackup({}, null, null);

    expect(backup).not.toHaveProperty('userId');
    expect(backup.synced).toBe(false);
    expect(Date.parse(backup.savedAt)).not.toBeNaN();
  });

  it('isOwnBackup: своя — только копия того же пользователя', () => {
    const own = at('2026-01-01T00:00:00Z', { userId: 'u1' });

    expect(isOwnBackup(own, 'u1')).toBe(true);
    expect(isOwnBackup(own, 'u2'), 'другой аккаунт').toBe(false);
    expect(isOwnBackup(own, null), 'гость').toBe(false);
    expect(isOwnBackup(at('2026-01-01T00:00:00Z'), 'u1'), 'старая копия без владельца — ничья').toBe(false);
    expect(isOwnBackup(null, 'u1')).toBe(false);
  });

  it('hasUnsyncedBackup: только своя несинхронизированная копия', () => {
    expect(hasUnsyncedBackup('p4', 'u1')).toBe(false);
    writeBackup('p4', at('2026-01-01T00:00:00Z', { synced: true, userId: 'u1' }));
    expect(hasUnsyncedBackup('p4', 'u1')).toBe(false);

    writeBackup('p4', at('2026-01-01T00:00:00Z', { userId: 'u1' }));
    expect(hasUnsyncedBackup('p4', 'u1')).toBe(true);
    expect(hasUnsyncedBackup('p4', 'u2')).toBe(false);
    expect(hasUnsyncedBackup('p4', null)).toBe(false);

    writeBackup('p4', at('2026-01-01T00:00:00Z'));
    expect(hasUnsyncedBackup('p4', 'u1'), 'копия без владельца').toBe(false);
  });

  it('shouldPreferBackup: своя или старая копия без владельца — по времени, чужая — никогда', () => {
    const newer = '2026-01-02T00:00:00Z';
    const server = '2026-01-01T00:00:00Z';

    expect(shouldPreferBackup(at(newer, { userId: 'u1' }), server, 'u1')).toBe(true);
    expect(shouldPreferBackup(at(newer, { userId: 'u1' }), '2026-01-03T00:00:00Z', 'u1'), 'на сервере новее').toBe(false);
    expect(shouldPreferBackup(at(newer, { userId: 'u1', synced: true }), server, 'u1'), 'уже на сервере').toBe(false);
    expect(shouldPreferBackup(at(newer, { userId: 'u2' }), server, 'u1'), 'чужая').toBe(false);
    expect(shouldPreferBackup(at(newer, { userId: 'u1' }), server, null), 'пользователь не известен').toBe(false);
    expect(shouldPreferBackup(at(newer), server, 'u1'), 'без владельца: сервер подтвердил, что проект этого пользователя').toBe(true);
    expect(shouldPreferBackup(at(newer, { userId: 'u1' }), undefined, 'u1')).toBe(true);
    expect(shouldPreferBackup(null, undefined, 'u1')).toBe(false);
  });
});
