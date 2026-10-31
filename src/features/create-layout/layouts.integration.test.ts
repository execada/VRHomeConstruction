import { beforeEach, describe, expect, it, vi } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import createSagaMiddleware from 'redux-saga';
import { ApiRequestError } from '@/app/api/client';
import { CreateLayoutFeature } from './index';

const api = vi.hoisted(() => ({ createLayout: vi.fn(), deleteLayout: vi.fn(), fetchLayouts: vi.fn() }));
const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn(), info: vi.fn() }));
vi.mock('@/app/api', () => ({ layoutsApi: api }));
vi.mock('@/shared/lib/toast', () => ({ toast }));
vi.mock('@/features/modals', () => ({ ModalsFeature: { actions: { closeCreateLayoutModal: () => ({ type: 'modals/close' }) } } }));

const { actions, selectors } = CreateLayoutFeature;
const flush = () => new Promise((r) => setTimeout(r, 0));
const layout = (id: string) => ({ id, name: `Шаблон ${id}` });

function setup() {
  const saga = createSagaMiddleware();
  const store = configureStore({
    reducer: { ...CreateLayoutFeature.reducer },
    middleware: (gdm) => gdm({ thunk: false }).concat(saga),
  });
  saga.run(CreateLayoutFeature.sagas.init);
  return store;
}

describe('шаблоны', () => {
  beforeEach(() => {
    Object.values(api).forEach((fn) => fn.mockReset());
    Object.values(toast).forEach((fn) => fn.mockReset());
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  it('создаёт шаблон и очищает форму', async () => {
    api.createLayout.mockResolvedValue(layout('n'));
    const store = setup();
    store.dispatch(actions.setLayoutName('  Студия  '));

    store.dispatch(actions.createLayoutRequested());
    await flush();

    expect(api.createLayout).toHaveBeenCalledWith('Студия');
    expect(selectors.selectLayouts(store.getState()).map((l) => l.id)).toEqual(['n']);
  });

  it('без названия не обращается к серверу', async () => {
    const store = setup();
    store.dispatch(actions.createLayoutRequested());
    await flush();
    expect(api.createLayout).not.toHaveBeenCalled();
    expect(store.getState().createLayout.error).toBe('Введите название макета');
  });

  it('переводит ошибку создания', async () => {
    api.createLayout.mockRejectedValue(new ApiRequestError(400, 'name must be between 1 and 120 characters'));
    const store = setup();
    store.dispatch(actions.setLayoutName('X'));
    store.dispatch(actions.createLayoutRequested());
    await flush();
    expect(store.getState().createLayout.error).toBe('Название — от 1 до 120 символов');
  });

  it('неудачное удаление сообщает причину и возвращает шаблон', async () => {
    api.deleteLayout.mockRejectedValue(new ApiRequestError(500, 'internal server error'));
    api.fetchLayouts.mockResolvedValue([layout('a'), layout('b')]);
    const store = setup();
    store.dispatch(actions.addLayout(layout('a')));
    store.dispatch(actions.addLayout(layout('b')));

    store.dispatch(actions.removeLayout('b'));
    await flush();

    expect(toast.error).toHaveBeenCalledWith('Сервер временно недоступен, попробуйте позже');
    expect(selectors.selectLayouts(store.getState()).map((l) => l.id)).toEqual(['a', 'b']);
  });
});
