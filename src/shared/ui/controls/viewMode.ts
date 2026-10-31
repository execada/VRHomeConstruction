/**
 * Вид списка: плитка или строки (запоминается в localStorage, поэтому со схемой).
 * @module shared/ui/controls/viewMode
 */

import { z } from 'zod';

export const viewModeSchema = z.enum(['grid', 'list']);
export type ViewMode = z.infer<typeof viewModeSchema>;
