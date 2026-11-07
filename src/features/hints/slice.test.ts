import { describe, expect, it } from 'vitest';
import { actions, reducer } from './slice';
import type { HintsState } from './types';

const base: HintsState = { enabled: true, dismissed: [], tourStep: null, tourDone: false };

describe('hints slice', () => {
  it('выключает и включает подсказки', () => {
    expect(reducer(base, actions.setEnabled(false)).enabled).toBe(false);
  });

  it('закрывает подсказку один раз и показывает все заново', () => {
    const once = reducer(base, actions.dismiss('catalog'));
    expect(reducer(once, actions.dismiss('catalog')).dismissed).toEqual(['catalog']);
    expect(reducer({ ...once, enabled: false }, actions.resetHints())).toMatchObject({ enabled: true, dismissed: [] });
  });

  it('обучение: старт с первого шага, переходы, завершение', () => {
    const started = reducer(base, actions.startTour());
    expect(started.tourStep).toBe(0);
    expect(reducer(started, actions.setTourStep(3.7)).tourStep).toBe(3);
    expect(reducer(started, actions.setTourStep(-2)).tourStep).toBe(0);
    expect(reducer(started, actions.finishTour())).toMatchObject({ tourStep: null, tourDone: true });
  });
});
