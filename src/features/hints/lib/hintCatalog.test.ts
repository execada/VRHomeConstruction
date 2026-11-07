import { describe, expect, it } from 'vitest';
import { currentHint, HINT_TARGETS, HINTS, TOUR_STEPS, type HintContext } from './hintCatalog';

const empty: HintContext = { furniture: 0, selected: false, viewMode: '3d' };
const furnished: HintContext = { furniture: 3, selected: false, viewMode: '3d' };
const everywhere = () => true;

describe('подсказки по порядку', () => {
  it('в пустой комнате — «здесь выберите модели»', () => {
    expect(currentHint(empty, [], everywhere)?.id).toBe('catalog');
  });

  it('после первого предмета — «сюда — дизайн», затем следующие по мере закрытия', () => {
    const one = { ...empty, furniture: 1 };
    expect(currentHint(one, [], everywhere)?.id).toBe('finishes');
    expect(currentHint(one, ['finishes'], everywhere)?.id).toBe('inspector');
    expect(currentHint(one, ['finishes', 'inspector', 'room'], everywhere)?.id).toBe('tools');
  });

  it('закрытые и не к месту пропускаются, а когда всё закрыто — ничего', () => {
    const all = HINTS.map((h) => h.id);
    expect(currentHint(furnished, all, everywhere)).toBeNull();
    expect(currentHint({ ...furnished, viewMode: '2d' }, ['finishes', 'inspector', 'room'], everywhere)?.id).toBe('vr');
  });

  it('подсказка, чьего элемента нет на экране, ждёт', () => {
    const noCatalog = (target: string) => target !== HINT_TARGETS.catalog;
    expect(currentHint(empty, [], noCatalog)).toBeNull();
    const noFinishes = (target: string) => target !== HINT_TARGETS.finishes;
    expect(currentHint(furnished, [], noFinishes)?.id).toBe('inspector');
  });

  it('у подсказок и шагов обучения уникальные id и непустые тексты', () => {
    expect(new Set(HINTS.map((h) => h.id)).size).toBe(HINTS.length);
    [...HINTS, ...TOUR_STEPS].forEach((h) => {
      expect(h.title.length).toBeGreaterThan(0);
      expect(h.text.length).toBeGreaterThan(10);
    });
    expect(TOUR_STEPS[0].target).toBeNull();
  });
});
