/**
 * Шаблоны для галереи: встроенные (строятся один раз за сессию) и шаблоны пользователя из стора.
 * @module templates/model/useTemplateEntries
 */

import { useMemo } from 'react';
import { useSelector } from 'react-redux';
import { CreateLayoutFeature } from '@/features/create-layout';
import { BUILTIN_TEMPLATES } from '../lib/builtins';
import { toBuiltinEntries, toLayoutEntries, type TemplateEntry } from '../lib/entries';

let builtinEntries: TemplateEntry[] | null = null;

/** Встроенные шаблоны с документами для превью (ленивая единоразовая сборка). */
function getBuiltinEntries(): TemplateEntry[] {
  builtinEntries ??= toBuiltinEntries(BUILTIN_TEMPLATES);
  return builtinEntries;
}

export function useTemplateEntries(): { builtin: TemplateEntry[]; mine: TemplateEntry[] } {
  const layouts = useSelector(CreateLayoutFeature.selectors.selectLayouts);
  const mine = useMemo(() => toLayoutEntries(layouts), [layouts]);
  return { builtin: getBuiltinEntries(), mine };
}
