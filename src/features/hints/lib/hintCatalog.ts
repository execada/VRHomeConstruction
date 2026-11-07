/**
 * Подсказки редактора и шаги обучения: к какому элементу интерфейса привязаны (CSS-селектор),
 * что говорят и когда уместны. Подсказка показывается одна за раз — первая по порядку, которая
 * к месту, не закрыта и чей элемент сейчас на экране: пока комната пустая — «здесь выберите
 * модели», после первого предмета — «сюда — дизайн», дальше свойства, комната, инструменты,
 * камера, VR и где выключить подсказки.
 * @module hints/lib/hintCatalog
 */

/** Что известно о проекте для выбора подсказки. */
export interface HintContext {
  /** Предметов мебели на этаже */
  furniture: number;
  /** Выделен предмет, стена или проём */
  selected: boolean;
  /** 2D-план или 3D-сцена */
  viewMode: '2d' | '3d';
}

/** С какой стороны элемента подсказка. */
export type HintPlacement = 'right' | 'left' | 'top' | 'bottom';

/** Подсказка у элемента интерфейса. */
export interface HintDefinition {
  id: string;
  /** CSS-селектор элемента */
  target: string;
  placement: HintPlacement;
  title: string;
  text: string;
  /** Когда подсказка к месту */
  when: (ctx: HintContext) => boolean;
}

/** Шаг обучения: элемент (null — по центру экрана), заголовок и текст. */
export interface TourStep {
  target: string | null;
  placement: HintPlacement;
  title: string;
  text: string;
}

/** Элементы интерфейса, на которые указывают подсказки. */
export const HINT_TARGETS = {
  catalog: '[data-hint="catalog"]',
  finishes: '[data-hint="tab-finishes"]',
  room: '[data-hint="tab-room"]',
  light: '[data-hint="tab-light"]',
  tools: '[role="toolbar"][aria-label="Инструменты сцены"]',
  camera: '[role="radiogroup"][aria-label="Камера"]',
  viewMode: '[role="radiogroup"][aria-label="Режим редактора"]',
  inspector: 'aside[aria-label="Свойства"]',
  floors: '[data-hint="floors"]',
  vr: '[data-hint="vr"]',
  save: '[data-hint="save"]',
  help: '[data-hint="help"]',
} as const;

const T = HINT_TARGETS;
const started = (ctx: HintContext) => ctx.furniture > 0;

/** Подсказки по порядку показа. */
export const HINTS: readonly HintDefinition[] = [
  {
    id: 'catalog',
    target: T.catalog,
    placement: 'right',
    title: 'Здесь выберите модели',
    text: 'Кликните карточку, а потом по полу — предмет встанет сам: лампа — на стол, картина — на стену, подушка — на диван.',
    when: (ctx) => ctx.furniture === 0,
  },
  {
    id: 'finishes',
    target: T.finishes,
    placement: 'right',
    title: 'Сюда — дизайн',
    text: 'Вкладка «Отделка»: пол, стены и потолок — паркет, плитка, краска и обои.',
    when: started,
  },
  {
    id: 'inspector',
    target: T.inspector,
    placement: 'left',
    title: 'Свойства выделенного',
    text: 'Кликните предмет или стену — здесь его размер, высота, поворот, цвет и действия.',
    when: started,
  },
  {
    id: 'room',
    target: T.room,
    placement: 'right',
    title: 'Комната и этажи',
    text: 'Вкладка «Комната»: размеры, стены, окна и двери, высота этажа.',
    when: started,
  },
  {
    id: 'tools',
    target: T.tools,
    placement: 'top',
    title: 'Инструменты',
    text: 'Рисуйте стены, ставьте окна, двери и лестницы. Esc — обратно к выделению.',
    when: (ctx) => started(ctx) && ctx.viewMode === '3d',
  },
  {
    id: 'camera',
    target: T.camera,
    placement: 'bottom',
    title: 'Посмотрите вживую',
    text: 'Пройдитесь по квартире от первого лица (WASD), посмотрите сверху или с улицы.',
    when: (ctx) => ctx.furniture > 1 && ctx.viewMode === '3d',
  },
  {
    id: 'vr',
    target: T.vr,
    placement: 'bottom',
    title: 'VR-шлем',
    text: 'В шлеме квартира откроется в натуральную величину.',
    when: (ctx) => ctx.furniture > 1,
  },
  {
    id: 'help',
    target: T.help,
    placement: 'bottom',
    title: 'Помощь всегда здесь',
    text: 'Здесь выключаются подсказки и можно пройти обучение заново.',
    when: (ctx) => ctx.furniture > 1,
  },
];

/** Шаги обучения. */
export const TOUR_STEPS: readonly TourStep[] = [
  {
    target: null,
    placement: 'bottom',
    title: 'Обучение за минуту',
    text: 'Покажем, где что находится. «Далее» или стрелка →, «Назад» или ←, Esc — закрыть.',
  },
  {
    target: T.catalog,
    placement: 'right',
    title: 'Каталог моделей',
    text: 'Выберите карточку и кликните по полу или перетащите её в сцену. Лампы и вазы встают на столы, картины и полки — на стены, люстры — под потолок, подушки — на диван.',
  },
  { target: T.finishes, placement: 'right', title: 'Дизайн', text: 'Вкладка «Отделка»: материалы и цвета пола, стен и потолка.' },
  { target: T.room, placement: 'right', title: 'Комната', text: 'Размеры комнаты, толщина и материал стен, окна, двери, высота этажа.' },
  { target: T.light, placement: 'right', title: 'Свет', text: 'Светильники, солнце за окнами (время суток, сторона света) и вид за окном.' },
  { target: T.tools, placement: 'top', title: 'Инструменты', text: 'Выделение, стены, окна, двери, лестница. Esc — вернуться к выделению.' },
  { target: T.inspector, placement: 'left', title: 'Свойства', text: 'Кликните предмет, стену или пол — здесь их размеры, поворот, цвет и действия.' },
  { target: T.viewMode, placement: 'bottom', title: '2D и 3D', text: 'В 2D — план сверху с размерами, в 3D — объём.' },
  { target: T.camera, placement: 'bottom', title: 'Камера', text: 'Облёт, от первого лица (WASD, Shift — бег), план и вид с улицы.' },
  { target: T.floors, placement: 'right', title: 'Этажи', text: 'Добавляйте этажи и переключайтесь между ними.' },
  { target: T.vr, placement: 'bottom', title: 'VR', text: 'Откройте квартиру в VR-шлеме в натуральную величину.' },
  { target: T.save, placement: 'bottom', title: 'Сохранение', text: 'Всё сохраняется само. Отменить — Ctrl+Z, повторить — Ctrl+Shift+Z.' },
  { target: T.help, placement: 'bottom', title: 'Помощь', text: 'Здесь выключаются подсказки и можно пройти обучение заново. Удачи!' },
];

/**
 * Подсказка, которую показать сейчас.
 * @param ctx - состояние проекта
 * @param dismissed - закрытые подсказки
 * @param onScreen - есть ли элемент на экране
 * @param hints - подсказки по порядку
 * @returns null — показывать нечего
 */
export function currentHint(
  ctx: HintContext,
  dismissed: readonly string[],
  onScreen: (target: string) => boolean,
  hints: readonly HintDefinition[] = HINTS,
): HintDefinition | null {
  return hints.find((h) => !dismissed.includes(h.id) && h.when(ctx) && onScreen(h.target)) ?? null;
}
