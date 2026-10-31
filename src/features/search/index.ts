import { actions, reducer, name } from './slice';
import { selectors } from './selectors';
import { initSaga } from './saga';

export const SearchFeature = {
  reducer: { [name]: reducer },
  actions,
  selectors,
  sagas: { init: initSaga }
};