import { actions, reducer, name } from './slice';
import { selectors } from './selectors';

export const UniversalButtonFeature = {
  reducer: { [name]: reducer },
  actions,
  selectors
};