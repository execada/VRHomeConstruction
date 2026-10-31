import { describe, expect, it, vi } from 'vitest';

const createXRStore = vi.hoisted(() => vi.fn((options: unknown) => ({ options })));
vi.mock('@react-three/xr', () => ({ createXRStore }));

import { createVrStore } from './createVrStore';

describe('createVrStore', () => {
  it('настраивает сессию для Quest 3/3+ и PC VR без лишних разрешений', () => {
    createVrStore();
    const options = createXRStore.mock.lastCall?.[0] as Record<string, unknown>;
    expect(options).toMatchObject({
      offerSession: 'immersive-vr',
      frameRate: 'high',
      handTracking: true,
      anchors: false,
      meshDetection: false,
      planeDetection: false,
      hitTest: false,
      bodyTracking: false,
    });
    expect(options.foveation).toBeGreaterThan(0);
    expect(options.foveation).toBeLessThanOrEqual(1);
  });

  it('эмулятор шлема включается только в режиме разработки', () => {
    createVrStore();
    const options = createXRStore.mock.lastCall?.[0] as { emulate: unknown };
    expect(options.emulate).toEqual(process.env.NODE_ENV === 'development' ? expect.objectContaining({ type: 'metaQuest3' }) : false);
  });
});
