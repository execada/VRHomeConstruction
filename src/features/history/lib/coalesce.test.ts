import { describe, expect, it } from 'vitest';
import { BURST_WINDOW_MS, changeKey, pushLimited, SAME_TARGET_WINDOW_MS, shouldCoalesce } from './coalesce';

describe('changeKey', () => {
  it('uses the payload id when present', () => {
    expect(changeKey({ type: 'furniture/updateFurniture', payload: { id: 'f1' } })).toBe('furniture/updateFurniture:f1');
  });

  it('uses nested opening ids, partition ids and finish targets', () => {
    expect(changeKey({ type: 'editor/updateOpening', payload: { wallId: 'back', opening: { id: 'o1' } } })).toBe(
      'editor/updateOpening:o1',
    );
    expect(changeKey({ type: 'editor/addOpeningToPartition', payload: { partitionId: 'p1' } })).toBe(
      'editor/addOpeningToPartition:p1',
    );
    expect(changeKey({ type: 'editor/setFinish', payload: { target: 'floor' } })).toBe('editor/setFinish:floor');
  });

  it('handles string and empty payloads', () => {
    expect(changeKey({ type: 'furniture/removeFurniture', payload: 'f1' })).toBe('furniture/removeFurniture:f1');
    expect(changeKey({ type: 'editor/setDimensions' })).toBe('editor/setDimensions:');
  });
});

describe('shouldCoalesce', () => {
  const key = 'furniture/updateFurniture:f1';

  it('never coalesces the first change', () => {
    expect(shouldCoalesce(null, { key, time: 0 })).toBe(false);
  });

  it('merges repeated changes of the same object within the window', () => {
    expect(shouldCoalesce({ key, time: 0 }, { key, time: SAME_TARGET_WINDOW_MS - 1 })).toBe(true);
    expect(shouldCoalesce({ key, time: 0 }, { key, time: SAME_TARGET_WINDOW_MS + 1 })).toBe(false);
  });

  it('merges bursts of different actions (one user operation)', () => {
    expect(shouldCoalesce({ key: 'a', time: 0 }, { key: 'b', time: BURST_WINDOW_MS - 1 })).toBe(true);
    expect(shouldCoalesce({ key: 'a', time: 0 }, { key: 'b', time: BURST_WINDOW_MS + 1 })).toBe(false);
  });

  it('merges a whole gesture on the same object regardless of pauses', () => {
    expect(shouldCoalesce({ key, time: 0, gesture: 3 }, { key, time: 5000, gesture: 3 })).toBe(true);
    expect(shouldCoalesce({ key: 'other', time: 0, gesture: 3 }, { key, time: 5000, gesture: 3 })).toBe(false);
  });

  it('does not merge two separate gestures on the same object', () => {
    expect(shouldCoalesce({ key, time: 0, gesture: 3 }, { key, time: 5000, gesture: 4 })).toBe(false);
  });

  it('ignores clock jumps backwards', () => {
    expect(shouldCoalesce({ key, time: 100 }, { key, time: 50 })).toBe(false);
  });
});

describe('pushLimited', () => {
  it('keeps only the newest items', () => {
    expect(pushLimited([1, 2, 3], 4, 3)).toEqual([2, 3, 4]);
  });

  it('does not mutate the source stack', () => {
    const stack = [1];
    pushLimited(stack, 2);
    expect(stack).toEqual([1]);
  });
});
