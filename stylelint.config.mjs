/**
 * Stylelint: стандарт для SCSS + поправки под CSS-модули проекта.
 * @type {import('stylelint').Config}
 */
export default {
  extends: ['stylelint-config-standard-scss'],
  ignoreFiles: ['dist/**', 'coverage/**', 'node_modules/**', 'node_modules.nosync/**', 'public/**'],
  rules: {
    // CSS-модули экспортируются в camelCase (`styles.cardTop`) — классы пишем так же.
    'selector-class-pattern': [
      '^[a-z][a-zA-Z0-9]*$',
      { message: 'Классы CSS-модулей — в camelCase (например, .cardTop)' },
    ],
    'keyframes-name-pattern': [
      '^[a-z][a-zA-Z0-9-]*$',
      { message: 'Имена keyframes — camelCase или kebab-case' },
    ],
    'scss/dollar-variable-pattern': '^[a-z][a-zA-Z0-9-]*$',
    // `:global(...)` — синтаксис CSS-модулей.
    'selector-pseudo-class-no-unknown': [true, { ignorePseudoClasses: ['global', 'local'] }],
    // Вложенные модификаторы карточек дают ложные срабатывания в CSS-модулях.
    'no-descending-specificity': null,
    // Компактные однострочные правила вида `.a { x: 1; }` используются осознанно.
    'declaration-block-single-line-max-declarations': null,
    'color-function-notation': null,
    'alpha-value-notation': null,
    'media-feature-range-notation': null,
  },
};
