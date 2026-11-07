import { describe, expect, it } from 'vitest';
import { bubblePosition } from './bubblePosition';

const viewport = { width: 1440, height: 900 };
const size = { width: 280, height: 120 };

describe('положение подсказки', () => {
  it('справа от элемента, по центру по высоте', () => {
    const p = bubblePosition({ left: 60, top: 200, width: 300, height: 400 }, size, 'right', viewport);
    expect(p).toEqual({ left: 372, top: 340, side: 'right' });
  });

  it('не помещается справа — слева; снизу у края окна — сверху', () => {
    expect(bubblePosition({ left: 1250, top: 300, width: 150, height: 40 }, size, 'right', viewport).side).toBe('left');
    expect(bubblePosition({ left: 600, top: 840, width: 200, height: 40 }, size, 'bottom', viewport).side).toBe('top');
  });

  it('всегда целиком в окне', () => {
    const p = bubblePosition({ left: 1400, top: 10, width: 40, height: 30 }, size, 'bottom', viewport);
    expect(p.left).toBe(1440 - 280 - 8);
    expect(p.top).toBeGreaterThanOrEqual(8);
  });
});
