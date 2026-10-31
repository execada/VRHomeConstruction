import { describe, expect, it } from 'vitest';
import { selectors } from './selectors';
import { actions, NOTIFICATIONS_LIMIT, reducer } from './slice';

const initial = () => reducer(undefined, { type: 'init' });
const root = (notifications: ReturnType<typeof initial>) => ({ notifications });

describe('notifications slice', () => {
  it('новые уведомления сверху, по умолчанию — «info», непрочитанные', () => {
    let state = reducer(initial(), actions.pushNotification({ title: 'Первое' }));
    state = reducer(state, actions.pushNotification({ kind: 'success', title: 'Второе', message: 'Готово' }));
    expect(state.items.map((n) => n.title)).toEqual(['Второе', 'Первое']);
    expect(state.items[1].kind).toBe('info');
    expect(selectors.selectUnreadCount(root(state))).toBe(2);
  });

  it(`хранит не больше ${NOTIFICATIONS_LIMIT} штук`, () => {
    let state = initial();
    for (let i = 0; i < NOTIFICATIONS_LIMIT + 5; i += 1) state = reducer(state, actions.pushNotification({ title: `#${i}` }));
    expect(state.items).toHaveLength(NOTIFICATIONS_LIMIT);
    expect(state.items[0].title).toBe(`#${NOTIFICATIONS_LIMIT + 4}`);
  });

  it('прочитать все, удалить одно, очистить', () => {
    let state = reducer(initial(), actions.pushNotification({ title: 'A' }));
    state = reducer(state, actions.pushNotification({ title: 'B' }));
    state = reducer(state, actions.markAllRead());
    expect(selectors.selectUnreadCount(root(state))).toBe(0);
    state = reducer(state, actions.dismissNotification(state.items[0].id));
    expect(state.items.map((n) => n.title)).toEqual(['A']);
    state = reducer(state, actions.clearNotifications());
    expect(selectors.selectNotifications(root(state))).toEqual([]);
  });
});
