import { actions, reducer, name } from './slice';
import { selectors } from './selectors';
import { initSaga } from './saga';
import { CreateFolderModal } from './ui/CreateFolderModal';

export const CreateFolderFeature = {
  reducer: { [name]: reducer },
  actions,
  sagas: { init: initSaga },
  selectors,
  ui: { CreateFolderModal },
};