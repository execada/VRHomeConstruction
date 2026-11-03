/**
 * Ванная и постирочная: отдельностоящая ванна с напольным смесителем, душевое
 * ограждение walk-in, тумба из ореха с накладной раковиной, стиральная машина.
 */

import { box, cylinder, lathe, torus, tube, ModelBuilder } from './geometry.mjs';
import { M } from './materials.mjs';

/** Отдельностоящая овальная ванна 170 × 80 см (литой камень) с напольным смесителем. */
export function bathtubFreestanding() {
  const b = new ModelBuilder();
  const profile = [
    [0, 0], [0.3, 0], [0.335, 0.03], [0.375, 0.25], [0.398, 0.5], [0.405, 0.575], [0.398, 0.6],
    [0.378, 0.6], [0.37, 0.57], [0.355, 0.4], [0.31, 0.16], [0.24, 0.085], [0, 0.075],
  ];
  b.add(M.ceramic, lathe(profile, 72), { scale: [2.05, 1, 1] });
  const x = 0.97;
  b.add(M.chrome, cylinder(0.06, 0.06, 0.012), { at: [x, 0.006, 0] });
  b.add(M.chrome, cylinder(0.016, 0.016, 0.86), { at: [x, 0.44, 0] });
  b.add(M.chrome, tube([[x, 0.86, 0], [x, 0.93, 0], [x - 0.08, 0.96, 0], [x - 0.2, 0.9, 0], [x - 0.22, 0.86, 0]], 0.014), {});
  b.add(M.chrome, cylinder(0.02, 0.02, 0.05), { at: [x, 0.62, 0.03], rotate: [Math.PI / 2, 0, 0] });
  return b;
}

/** Душевое ограждение walk-in 120 × 90 см: поддон из камня, стекло в латунном профиле, тропический душ. */
export function showerWalkIn() {
  const b = new ModelBuilder();
  const [w, d, h] = [1.2, 0.9, 2.0];
  b.add(M.quartz, box(w, 0.04, d, 0.004), { at: [0, 0.02, 0] });
  b.add(M.steel, box(0.7, 0.004, 0.04, 0), { at: [0, 0.041, -d / 2 + 0.12] });
  const panelW = 0.85;
  const panelX = -w / 2 + panelW / 2;
  b.add(M.glass, box(panelW, h, 0.008, 0), { at: [panelX, 0.04 + h / 2, d / 2 - 0.03] });
  b.add(M.brass, box(panelW, 0.02, 0.02, 0.002), { at: [panelX, 0.04 + h, d / 2 - 0.03] });
  b.add(M.brass, box(0.02, h, 0.02, 0.002), { at: [-w / 2 + 0.01, 0.04 + h / 2, d / 2 - 0.03] });
  b.add(M.brass, cylinder(0.008, 0.008, d - 0.03), { at: [panelX + panelW / 2 - 0.05, 0.04 + h, 0], rotate: [Math.PI / 2, 0, 0] });
  const wallZ = -d / 2 + 0.02;
  b.add(M.brass, cylinder(0.012, 0.012, 1.1), { at: [0.25, 1.5, wallZ] });
  b.add(M.brass, tube([[0.25, 2.05, wallZ], [0.25, 2.1, wallZ + 0.06], [0.25, 2.1, wallZ + 0.3]], 0.011), {});
  b.add(M.brass, box(0.3, 0.012, 0.3, 0.004), { at: [0.25, 2.09, wallZ + 0.32] });
  b.add(M.brass, cylinder(0.05, 0.05, 0.03), { at: [0.25, 1.1, wallZ], rotate: [Math.PI / 2, 0, 0] });
  b.add(M.brass, box(0.015, 0.07, 0.02, 0.005), { at: [0.25, 1.1, wallZ + 0.03] });
  return b;
}

/** Тумба 100 см из ореха на латунных ножках, кварцевая столешница, накладная раковина и высокий смеситель. */
export function vanityWalnut() {
  const b = new ModelBuilder();
  const [w, d] = [1.0, 0.5];
  const [legH, bodyH] = [0.2, 0.5];
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) =>
    b.add(M.brass, cylinder(0.014, 0.01, legH), { at: [sx * (w / 2 - 0.05), legH / 2, sz * (d / 2 - 0.05)] }),
  );
  b.add(M.walnut, box(w, bodyH, d, 0.004), { at: [0, legH + bodyH / 2, 0] });
  [0.375, 0.125].forEach((dy) => {
    b.add(M.walnut, box(w - 0.01, bodyH / 2 - 0.006, 0.018, 0.002), { at: [0, legH + bodyH * dy * 2, d / 2 + 0.009] });
    b.add(M.brass, box(0.3, 0.012, 0.016, 0.004), { at: [0, legH + bodyH * dy * 2 + 0.07, d / 2 + 0.028] });
  });
  const top = legH + bodyH;
  b.add(M.quartz, box(w + 0.02, 0.02, d + 0.02, 0.003), { at: [0, top + 0.01, 0] });
  const basin = [[0, 0], [0.12, 0], [0.19, 0.04], [0.21, 0.13], [0.205, 0.14], [0.195, 0.135], [0.18, 0.06], [0.11, 0.025], [0, 0.02]];
  b.add(M.ceramic, lathe(basin, 64), { at: [0, top + 0.02, 0.03] });
  b.add(M.brass, cylinder(0.018, 0.022, 0.3), { at: [0, top + 0.17, -0.2] });
  b.add(M.brass, tube([[0, top + 0.31, -0.2], [0, top + 0.34, -0.15], [0, top + 0.33, -0.05], [0, top + 0.3, -0.03]], 0.011), {});
  return b;
}

/** Стиральная машина 60 × 60 × 85 см: люк с хромированным кольцом, панель с дисплеем и селектором. */
export function washingMachine() {
  const b = new ModelBuilder();
  const [w, h, d] = [0.6, 0.85, 0.58];
  b.add(M.plasticWhite, box(w, h, d, 0.018), { at: [0, h / 2, 0] });
  const front = d / 2;
  const doorY = 0.4;
  b.add(M.chrome, torus(0.19, 0.022, 72), { at: [0, doorY, front + 0.012] });
  b.add(M.blackGlass, cylinder(0.175, 0.175, 0.012, 64), { at: [0, doorY, front + 0.01], rotate: [Math.PI / 2, 0, 0] });
  b.add(M.steel, cylinder(0.15, 0.15, 0.004, 64), { at: [0, doorY, front + 0.001], rotate: [Math.PI / 2, 0, 0] });
  b.add(M.plasticWhite, box(w - 0.02, 0.1, 0.012, 0.004), { at: [0, h - 0.07, front + 0.004] });
  b.add(M.plasticWhite, box(0.17, 0.07, 0.014, 0.004), { at: [-0.19, h - 0.07, front + 0.01] });
  b.add(M.display, box(0.11, 0.035, 0.004, 0), { at: [0.03, h - 0.07, front + 0.011] });
  b.add(M.chrome, cylinder(0.032, 0.032, 0.025, 40), { at: [0.2, h - 0.07, front + 0.016], rotate: [Math.PI / 2, 0, 0] });
  b.add(M.rubber, box(w - 0.04, 0.02, d - 0.04, 0.004), { at: [0, 0.01, 0] });
  return b;
}
