import { beforeEach, describe, expect, it, vi } from 'vitest';
import { markBackupSynced, readBackup, removeBackup, shouldPreferBackup, writeBackup } from './localBackup';

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
