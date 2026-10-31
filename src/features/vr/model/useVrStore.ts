/**
 * Store XR-сессии на время жизни страницы редактора.
 * Уничтожается только при настоящем размонтировании: в StrictMode React
 * монтирует эффекты дважды, и немедленный destroy() сломал бы store навсегда.
 * @module vr/model/useVrStore
 */

import { useEffect, useRef, useState } from 'react';
import { createVrStore, type VrStore } from '../lib/createVrStore';

export function useVrStore(): VrStore {
  const [store] = useState(createVrStore);
  const mounted = useRef(0);

  useEffect(() => {
    mounted.current += 1;
    return () => {
      mounted.current -= 1;
      window.setTimeout(() => {
        if (mounted.current === 0) store.destroy();
      }, 0);
    };
  }, [store]);

  return store;
}
