import { describe, expect, it, vi } from 'vitest';

const preload = vi.hoisted(() => vi.fn());
vi.mock('@react-three/drei', () => ({ useGLTF: { preload } }));

import { preloadModel, PRIMITIVE_PREFIX } from './preload';

describe('preloadModel', () => {
  it('загружает файлы моделей заранее', () => {
    preloadModel('/models/sofa.glb');
    expect(preload).toHaveBeenCalledWith('/models/sofa.glb');
  });

  it('процедурная мебель не требует загрузки', () => {
    preload.mockClear();
    preloadModel(`${PRIMITIVE_PREFIX}rug`);
    expect(preload).not.toHaveBeenCalled();
  });
});
