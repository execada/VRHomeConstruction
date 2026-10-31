// @vitest-environment jsdom
import { File as NodeFile } from 'node:buffer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildProjectFile, downloadProjectFile, MAX_PROJECT_FILE_BYTES, readProjectFile } from './projectFile';

describe('файлы проекта в браузере', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    URL.createObjectURL = vi.fn(() => 'blob:project');
    URL.revokeObjectURL = vi.fn();
  });
  afterEach(() => vi.useRealTimers());

  it('скачивание создаёт ссылку с безопасным именем и освобождает URL', () => {
    const clicks: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      clicks.push(this.download);
    });
    downloadProjectFile(buildProjectFile('Гостиная <script>', { schemaVersion: 2 }));
    expect(clicks).toEqual(['Гостиная script.vrhome.json']);
    expect(document.querySelector('a')).toBeNull();
    vi.advanceTimersByTime(1000);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:project');
  });

  it('читает выбранный файл и отклоняет слишком большие', async () => {
    vi.useRealTimers();
    // В jsdom у File нет text(), поэтому — файл из Node (тот же стандартный интерфейс, что в браузере).
    const file = new NodeFile([JSON.stringify(buildProjectFile('Кухня', { schemaVersion: 2 }))], 'kitchen.vrhome.json', { type: 'application/json' });
    await expect(readProjectFile(file as unknown as File)).resolves.toMatchObject({ name: 'Кухня' });

    const huge = new NodeFile(['x'], 'huge.json') as unknown as File;
    Object.defineProperty(huge, 'size', { value: MAX_PROJECT_FILE_BYTES + 1 });
    await expect(readProjectFile(huge)).rejects.toThrow('Файл слишком большой');
  });
});
