import { takeLatest, put, select, all, call } from 'typed-redux-saga';
import { ModalsFeature } from '@/features/modals';
import { actions } from './slice';
import { selectors } from './selectors';
import { layoutsApi } from '@/app/api';
import { apiErrorText } from '@/app/api/errors';
import { toast } from '@/shared/lib/toast';

function* handleCreateLayout() {
  try {
    const layoutName = yield* select(selectors.selectLayoutName);
    const trimmedName = layoutName.trim();
    if (!trimmedName) {
      yield* put(actions.setError('Введите название макета'));
      return;
    }
    yield* put(actions.setIsLoading(true));
    yield* put(actions.setError(null));

    const layout = yield* call(layoutsApi.createLayout, trimmedName);

    yield* put(actions.addLayout(layout));
    yield* put(actions.resetForm());
    yield* put(ModalsFeature.actions.closeCreateLayoutModal());
  } catch (error) {
    yield* put(actions.setError(apiErrorText(error, 'Ошибка при создании макета')));
  } finally {
    yield* put(actions.setIsLoading(false));
  }
}

/** Удаление уже применено в интерфейсе; если сервер отказал — сообщаем и перечитываем список. */
function* handleDeleteLayout(action: ReturnType<typeof actions.removeLayout>) {
  try {
    yield* call(layoutsApi.deleteLayout, action.payload);
  } catch (error) {
    console.error('Не удалось удалить шаблон', error);
    yield* call(toast.error, apiErrorText(error, 'Не удалось удалить шаблон'));
    try {
      const layouts = yield* call(layoutsApi.fetchLayouts);
      yield* put(actions.replaceLayouts(layouts));
    } catch (reloadError) {
      console.error('Не удалось перечитать шаблоны', reloadError);
    }
  }
}

export function* initSaga() {
  yield all([
    takeLatest(actions.createLayoutRequested.type, handleCreateLayout),
    takeLatest(actions.removeLayout.type, handleDeleteLayout),
  ]);
}
