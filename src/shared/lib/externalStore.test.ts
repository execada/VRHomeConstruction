import { describe, expect, it, vi } from 'vitest';
import { createExternalStore } from './externalStore';

describe('createExternalStore', () => {
  it('merges patches into a new state object', () => {
    const store = createExternalStore({ a: 1, b: 'x' });
    const before = store.getState();
    store.setState({ a: 2 });
    expect(store.getState()).toEqual({ a: 2, b: 'x' });
    expect(store.getState()).not.toBe(before);
    expect(before.a).toBe(1);
  });

  it('supports functional updates', () => {
    const store = createExternalStore({ count: 1 });
    store.setState((prev) => ({ count: prev.count + 1 }));
    expect(store.getState().count).toBe(2);
  });

  it('notifies and unsubscribes listeners', () => {
    const store = createExternalStore({ v: 0 });
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    store.setState({ v: 1 });
    unsubscribe();
    store.setState({ v: 2 });
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
