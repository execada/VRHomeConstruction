import { describe, expect, it } from 'vitest';
import { buildProjectFile, dataUrlToBlob, parseProjectFile, PROJECT_FILE_VERSION, safeFileName } from './projectFile';

describe('project file', () => {
  it('round-trips through JSON', () => {
    const file = buildProjectFile('Гостиная', { schemaVersion: 2 });
    const parsed = parseProjectFile(JSON.stringify(file));
    expect(parsed.name).toBe('Гостиная');
    expect(parsed.version).toBe(PROJECT_FILE_VERSION);
    expect(parsed.roomData).toEqual({ schemaVersion: 2 });
  });

  it('accepts legacy v1 files', () => {
    const legacy = { app: 'vr-home-construction', version: 1, name: 'Старый', savedAt: 'x', roomData: { dimensions: {} }, playerPosition: null };
    expect(parseProjectFile(JSON.stringify(legacy)).roomData).toEqual({ dimensions: {} });
  });

  it('rejects non-JSON, foreign and future files with readable messages', () => {
    expect(() => parseProjectFile('nope')).toThrow('это не JSON');
    expect(() => parseProjectFile(JSON.stringify({ app: 'other' }))).toThrow('Это не файл проекта');
    expect(() => parseProjectFile(JSON.stringify({ app: 'vr-home-construction', version: 99, roomData: {} }))).toThrow('более новой версией');
  });

  it('uses defaults for broken names', () => {
    const parsed = parseProjectFile(JSON.stringify({ app: 'vr-home-construction', version: 2, name: 42, savedAt: 1, roomData: {} }));
    expect(parsed.name).toBe('Импортированный проект');
  });

  it('builds safe file names', () => {
    expect(safeFileName('Кухня <script>', '.json')).toBe('Кухня script.json');
    expect(safeFileName('../../', '.json')).toBe('project.json');
  });

  it('converts data URLs to blobs', async () => {
    const blob = dataUrlToBlob('data:image/jpeg;base64,AAEC');
    expect(blob.type).toBe('image/jpeg');
    expect(blob.size).toBe(3);
  });
});
