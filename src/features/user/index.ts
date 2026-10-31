/**
 * Публичный API фичи пользователя.
 * @module user
 */

import { actions, reducer, name } from './slice';
import { selectors } from './selectors';
import { initSaga } from './saga';

export const UserFeature = {
  reducer: { [name]: reducer },
  actions,
  sagas: {
    init: initSaga,
  },
  selectors,
};

export { AuthModal } from './ui/AuthModal';
export { ChangeNameDialog } from './ui/ChangeNameDialog';
export { ChangeEmailDialog } from './ui/ChangeEmailDialog';
