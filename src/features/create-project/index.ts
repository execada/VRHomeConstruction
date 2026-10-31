import { actions, reducer, name } from './slice';
import { selectors } from './selectors';
import { initSaga, loadProjects } from './saga';

export const CreateProjectFeature = {
  reducer: { [name]: reducer },
  actions,
  sagas: {
    init: initSaga,
    loadProjects,
  },
  selectors,
};