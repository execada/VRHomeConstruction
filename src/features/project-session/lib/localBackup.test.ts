import { beforeEach, describe, expect, it, vi } from 'vitest';
import { hasUnsyncedBackup, markBackupSynced, readBackup, removeBackup, shouldPreferBackup, writeBackup } from './localBackup';

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

    writeBackup('q1', { roomData: { a: 2 }, camera: null, savedAt: '2026-01-01T00:00:00Z', synced: false });

    expect(warn).toHaveBeenCalled();
    expect(readBackup('q1')?.roomData).toEqual({ a: 2 });
    expect(hasUnsyncedBackup('q1')).toBe(true);
    markBackupSynced('q1');
    expect(hasUnsyncedBackup('q1')).toBe(false);
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

  it('hasUnsyncedBackup: только несинхронизированная копия', () => {
    expect(hasUnsyncedBackup('p4')).toBe(false);
    writeBackup('p4', { roomData: {}, camera: null, savedAt: '2026-01-01T00:00:00Z', synced: true });
    expect(hasUnsyncedBackup('p4')).toBe(false);
    writeBackup('p4', { roomData: {}, camera: null, savedAt: '2026-01-01T00:00:00Z', synced: false });
    expect(hasUnsyncedBackup('p4')).toBe(true);
  });

  it('ignores corrupted backups', () => {
    window.localStorage.setItem('vrhc:backup:p2', '{not json');
    expect(readBackup('p2')).toBeNull();
    window.localStorage.setItem('vrhc:backup:p3', JSON.stringify({ roomData: 1, camera: 'x', savedAt: 1, synced: 'no' }));
    expect(readBackup('p3')).toBeNull();
  });

  it('prefers unsynced backups newer than the server version', () => {
    const backup = { roomData: {}, camera: null, savedAt: '2026-01-02T00:00:00Z', synced: false };
    expect(shouldPreferBackup(backup, '2026-01-01T00:00:00Z')).toBe(true);
    expect(shouldPreferBackup(backup, '2026-01-03T00:00:00Z')).toBe(false);
    expect(shouldPreferBackup({ ...backup, synced: true }, undefined)).toBe(false);
    expect(shouldPreferBackup(backup, undefined)).toBe(true);
    expect(shouldPreferBackup(null, undefined)).toBe(false);
  });
});
