/**
 * Подключает хуки загрузчика (ts-hooks.mjs): `node --import ./scripts/models/register-ts.mjs …`.
 */
import { register } from 'node:module';

register('./ts-hooks.mjs', import.meta.url);
