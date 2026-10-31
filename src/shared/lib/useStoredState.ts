/**
 * Состояние компонента, которое запоминается в localStorage (вид списка, свёрнутая панель).
 * Значение проверяется схемой при чтении; недоступное хранилище не ломает работу.
 * @module shared/lib/useStoredState
 */

import { useCallback, useState } from 'react';
import type { z } from 'zod';
import { readStored, writeStored } from './storage';

export function useStoredState<T>(key: string, schema: z.ZodType<T>, fallback: T): [T, (next: T) => void] {
  const [value, setValue] = useState<T>(() => readStored(key, schema, fallback));
  const update = useCallback(
    (next: T) => {
      setValue(next);
      writeStored(key, next);
    },
    [key],
  );
  return [value, update];
}
