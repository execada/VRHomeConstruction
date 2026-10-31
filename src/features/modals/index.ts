import { actions, reducer, name } from './slice';
import { selectors } from './selectors';

export const ModalsFeature = {
  reducer: { [name]: reducer },
  actions,
  selectors,
};