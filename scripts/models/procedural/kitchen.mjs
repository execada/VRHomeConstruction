/**
 * Кухня: модули 60 см глубиной и 92 см высотой (цоколь 10 см, корпус, кварцевая
 * столешница 4 см), фасады в лаке «грейж» с латунными ручками, мойка, варочная панель
 * с духовкой, холодильник French Door, остров с «водопадом».
 */

import { box, cylinder, tube, ModelBuilder } from './geometry.mjs';
import { M } from './materials.mjs';

const DEPTH = 0.6;
const PLINTH = 0.1;
const CARCASS_TOP = 0.88;
const TOP = 0.04;
const FRONT_Z = DEPTH / 2 - 0.02;
const GAP = 0.003;

/** Цоколь, корпус и задняя часть модуля шириной width. */
function carcass(b, width) {
  b.add(M.blackMetal, box(width - 0.01, PLINTH, DEPTH - 0.1, 0.002), { at: [0, PLINTH / 2, -0.05] });
  b.add(M.lacquerGreige, box(width, CARCASS_TOP - PLINTH, DEPTH - 0.04, 0.002), { at: [0, (CARCASS_TOP + PLINTH) / 2, -0.02] });
}

/** Фасад с горизонтальной латунной ручкой. */
function front(b, x, y, width, height, material = M.lacquerGreige) {
  b.add(material, box(width - GAP * 2, height - GAP * 2, 0.018, 0.002), { at: [x, y, FRONT_Z + 0.009] });
  b.add(M.brass, box(Math.min(0.32, width * 0.55), 0.012, 0.016, 0.004), { at: [x, y + height / 2 - 0.05, FRONT_Z + 0.03] });
}

/** Ряд распашных дверей на всю высоту корпуса. */
function doors(b, width, count) {
  const w = width / count;
  for (let i = 0; i < count; i++) front(b, -width / 2 + w * (i + 0.5), (CARCASS_TOP + PLINTH) / 2, w, CARCASS_TOP - PLINTH);
}

/** Кварцевая столешница с небольшим свесом. */
const worktop = (b, width) => b.add(M.quartz, box(width, TOP, DEPTH + 0.02, 0.003), { at: [0, CARCASS_TOP + TOP / 2, 0.01] });

/** Смеситель «гусак» (латунь). */
function gooseneck(b, x, z) {
  const y = CARCASS_TOP + TOP;
  b.add(M.brass, cylinder(0.026, 0.03, 0.04), { at: [x, y + 0.02, z] });
  b.add(M.brass, tube([[x, y + 0.03, z], [x, y + 0.3, z], [x, y + 0.38, z + 0.08], [x, y + 0.3, z + 0.2], [x, y + 0.22, z + 0.21]], 0.012), {});
  b.add(M.brass, cylinder(0.012, 0.012, 0.09), { at: [x + 0.04, y + 0.08, z], rotate: [0, 0, Math.PI / 2] });
}

/** Кухонный модуль 120 см с двумя дверями. */
export function kitchenBase() {
  const b = new ModelBuilder();
  carcass(b, 1.2);
  doors(b, 1.2, 2);
  worktop(b, 1.2);
  return b;
}

/** Модуль 120 см с врезной стальной мойкой и смесителем. */
export function kitchenSink() {
  const b = new ModelBuilder();
  const [w, sinkW, sinkD, sinkDepth] = [1.2, 0.56, 0.4, 0.2];
  carcass(b, w);
  doors(b, w, 2);
  const y = CARCASS_TOP + TOP / 2;
  const side = (w - sinkW) / 2;
  b.add(M.quartz, box(side, TOP, DEPTH + 0.02, 0.003), { at: [-(sinkW + side) / 2, y, 0.01] });
  b.add(M.quartz, box(side, TOP, DEPTH + 0.02, 0.003), { at: [(sinkW + side) / 2, y, 0.01] });
  b.add(M.quartz, box(sinkW, TOP, 0.12, 0.002), { at: [0, y, 0.01 + (DEPTH + 0.02) / 2 - 0.06] });
  b.add(M.quartz, box(sinkW, TOP, DEPTH + 0.02 - 0.12 - sinkD, 0.002), { at: [0, y, -0.3 + (DEPTH - 0.1 - sinkD) / 2] });
  const [cz, bottom] = [0.31 - 0.12 - sinkD / 2 + 0.01, CARCASS_TOP + TOP - sinkDepth];
  b.add(M.steel, box(sinkW, 0.006, sinkD, 0), { at: [0, bottom, cz] });
  b.add(M.steel, box(sinkW, sinkDepth, 0.006, 0), { at: [0, bottom + sinkDepth / 2, cz - sinkD / 2] });
  b.add(M.steel, box(sinkW, sinkDepth, 0.006, 0), { at: [0, bottom + sinkDepth / 2, cz + sinkD / 2] });
  b.add(M.steel, box(0.006, sinkDepth, sinkD, 0), { at: [-sinkW / 2, bottom + sinkDepth / 2, cz] });
  b.add(M.steel, box(0.006, sinkDepth, sinkD, 0), { at: [sinkW / 2, bottom + sinkDepth / 2, cz] });
  b.add(M.chrome, cylinder(0.035, 0.035, 0.004), { at: [0, bottom + 0.005, cz] });
  gooseneck(b, 0, -0.22);
  return b;
}

/** Модуль 60 см: духовой шкаф, ящик, индукционная панель из чёрного стекла. */
export function kitchenHobOven() {
  const b = new ModelBuilder();
  const w = 0.6;
  carcass(b, w);
  b.add(M.blackGlass, box(w - 0.01, 0.6, 0.02, 0.003), { at: [0, PLINTH + 0.31, FRONT_Z + 0.01] });
  b.add(M.steel, box(0.48, 0.014, 0.02, 0.006), { at: [0, PLINTH + 0.56, FRONT_Z + 0.05] });
  b.add(M.steel, box(0.012, 0.012, 0.03, 0.004), { at: [-0.2, PLINTH + 0.56, FRONT_Z + 0.03] });
  b.add(M.steel, box(0.012, 0.012, 0.03, 0.004), { at: [0.2, PLINTH + 0.56, FRONT_Z + 0.03] });
  b.add(M.display, box(0.16, 0.025, 0.004, 0), { at: [0, PLINTH + 0.585, FRONT_Z + 0.021] });
  front(b, 0, PLINTH + 0.7, w, 0.18);
  worktop(b, w);
  b.add(M.blackGlass, box(0.58, 0.006, 0.51, 0.003), { at: [0, CARCASS_TOP + TOP + 0.003, 0] });
  [[-0.14, -0.1, 0.1], [0.14, -0.1, 0.08], [-0.14, 0.13, 0.08], [0.14, 0.13, 0.1]].forEach(([x, z, r]) => {
    b.add(M.steel, cylinder(r, r, 0.0015, 48), { at: [x, CARCASS_TOP + TOP + 0.0065, z] });
    b.add(M.blackGlass, cylinder(r - 0.006, r - 0.006, 0.002, 48), { at: [x, CARCASS_TOP + TOP + 0.007, z] });
  });
  return b;
}

/** Холодильник French Door 91 × 72 × 178 см из матовой стали. */
export function fridgeFrenchDoor() {
  const b = new ModelBuilder();
  const [w, d, h] = [0.91, 0.7, 1.78];
  b.add(M.steel, box(w, h - 0.06, d - 0.04, 0.01), { at: [0, 0.06 + (h - 0.06) / 2, -0.02] });
  b.add(M.blackMetal, box(w - 0.02, 0.06, d - 0.08, 0.004), { at: [0, 0.03, -0.04] });
  const frontZ = d / 2 - 0.02;
  const doorH = 1.04;
  [-1, 1].forEach((side) => {
    b.add(M.steel, box(w / 2 - 0.004, doorH, 0.05, 0.008), { at: [(side * w) / 4, h - doorH / 2 - 0.01, frontZ + 0.02] });
    b.add(M.steel, cylinder(0.011, 0.011, 0.62, 20), { at: [side * 0.035, h - doorH / 2 - 0.02, frontZ + 0.08] });
    [-0.25, 0.25].forEach((dy) => b.add(M.steel, box(0.014, 0.014, 0.045, 0.004), { at: [side * 0.035, h - doorH / 2 - 0.02 + dy, frontZ + 0.06] }));
  });
  const drawerH = h - doorH - 0.09;
  b.add(M.steel, box(w - 0.004, drawerH, 0.05, 0.008), { at: [0, 0.07 + drawerH / 2, frontZ + 0.02] });
  b.add(M.steel, cylinder(0.011, 0.011, 0.6, 20), { at: [0, 0.07 + drawerH - 0.07, frontZ + 0.08], rotate: [0, 0, Math.PI / 2] });
  b.add(M.blackGlass, box(0.12, 0.2, 0.006, 0.004), { at: [-w / 4, 1.22, frontZ + 0.048] });
  b.add(M.display, box(0.08, 0.02, 0.002, 0), { at: [-w / 4, 1.3, frontZ + 0.052] });
  return b;
}

/** Кухонный остров 240 × 100 см: фасады из ореха, кварцевая столешница с боковинами-«водопадом». */
export function kitchenIsland() {
  const b = new ModelBuilder();
  const [w, d, slab] = [2.4, 1.0, 0.04];
  const baseD = 0.58;
  const baseZ = d / 2 - baseD / 2 - 0.02;
  b.add(M.blackMetal, box(w - 0.2, PLINTH, baseD - 0.08, 0.002), { at: [0, PLINTH / 2, baseZ - 0.03] });
  b.add(M.walnut, box(w - 2 * slab, CARCASS_TOP - PLINTH, baseD, 0.002), { at: [0, (CARCASS_TOP + PLINTH) / 2, baseZ] });
  const doorW = (w - 2 * slab) / 4;
  for (let i = 0; i < 4; i++) {
    const x = -w / 2 + slab + doorW * (i + 0.5);
    b.add(M.walnut, box(doorW - GAP * 2, CARCASS_TOP - PLINTH - GAP * 2, 0.018, 0.002), { at: [x, (CARCASS_TOP + PLINTH) / 2, baseZ + baseD / 2 + 0.009] });
    b.add(M.brass, box(0.012, 0.22, 0.016, 0.004), { at: [x + (i % 2 ? -1 : 1) * (doorW / 2 - 0.05), CARCASS_TOP - 0.17, baseZ + baseD / 2 + 0.03] });
  }
  b.add(M.quartz, box(w, slab, d, 0.004), { at: [0, CARCASS_TOP + slab / 2 + 0.0, 0] });
  [-1, 1].forEach((side) => b.add(M.quartz, box(slab, CARCASS_TOP, d, 0.004), { at: [side * (w / 2 - slab / 2), CARCASS_TOP / 2, 0] }));
  return b;
}
