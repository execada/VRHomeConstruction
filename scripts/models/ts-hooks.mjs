/**
 * Хуки загрузчика Node для скриптов конвейера моделей: алиас `@/` → src/ и импорт
 * TS-модулей без расширения, как в приложении. Типы снимает сам Node (type stripping),
 * поэтому скрипты переиспользуют проверенную тестами логику из src без сборки.
 */

const SRC = new URL('../../src/', import.meta.url);
const HAS_EXTENSION = /\.(?:[cm]?[jt]sx?|json)$/;

/**
 * Разрешение спецификаторов импорта.
 * @param {string} specifier - спецификатор
 * @param {object} context - контекст загрузчика
 * @param {Function} nextResolve - следующий обработчик
 */
export async function resolve(specifier, context, nextResolve) {
  const aliased = specifier.startsWith('@/') ? new URL(specifier.slice(2), SRC).href : specifier;
  const local = aliased.startsWith('.') || aliased.startsWith('file:');
  if (!local || HAS_EXTENSION.test(aliased)) return nextResolve(aliased, context);
  try {
    return await nextResolve(`${aliased}.ts`, context);
  } catch {
    return nextResolve(aliased, context);
  }
}
