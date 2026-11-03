/**
 * Гостиная и спальня: ковры, торшер, напольное зеркало, телевизор 65″, кровать с мягким
 * изголовьем, прикроватная тумба из ореха, обеденный стол из ореха на металлическом основании.
 */

import * as THREE from 'three';
import { box, cylinder, extrude, flat, ModelBuilder } from './geometry.mjs';
import { M } from './materials.mjs';

/** Шерстяной ковёр «ёлочка» 300 × 200 см. */
export function rugWool() {
  return new ModelBuilder().add(M.woolRug, box(3.0, 0.012, 2.0, 0.005), { at: [0, 0.006, 0] });
}

/** Круглый ковёр букле Ø 200 см. */
export function rugRound() {
  return new ModelBuilder().add(M.boucle, cylinder(1, 1, 0.012, 96), { at: [0, 0.006, 0] });
}

/** Торшер: латунная стойка, льняной абажур-барабан с мягким свечением. */
export function floorLamp() {
  const b = new ModelBuilder();
  b.add(M.brass, cylinder(0.16, 0.17, 0.025, 64), { at: [0, 0.0125, 0] });
  b.add(M.brass, cylinder(0.011, 0.011, 1.42), { at: [0, 0.025 + 0.71, 0] });
  b.add(M.shadeLinen, openDrum(0.23, 0.25, 0.32), { at: [0, 1.49, 0] });
  b.add(M.brass, cylinder(0.035, 0.035, 0.05), { at: [0, 1.42, 0] });
  return b;
}

/** Открытый цилиндр (абажур без крышек). */
function openDrum(radiusTop, radiusBottom, height) {
  return new THREE.CylinderGeometry(radiusTop, radiusBottom, height, 64, 1, true);
}

/** Контур арки: прямоугольник с полукруглым верхом. */
function archShape(width, height) {
  const r = width / 2;
  const shape = new THREE.Shape();
  shape.moveTo(-r, -height / 2);
  shape.lineTo(r, -height / 2);
  shape.lineTo(r, height / 2 - r);
  shape.absarc(0, height / 2 - r, r, 0, Math.PI, false);
  shape.lineTo(-r, -height / 2);
  return shape;
}

/** Напольное зеркало-арка 80 × 190 см в латунной раме с опорой. */
export function floorMirror() {
  const b = new ModelBuilder();
  const [w, h, frame] = [0.8, 1.9, 0.025];
  const outer = archShape(w, h);
  outer.holes.push(archShape(w - frame * 2, h - frame * 2));
  const centerY = 0.03 + h / 2;
  b.add(M.brass, extrude(outer, 0.03, 0.002), { at: [0, centerY, 0] });
  b.add(M.mirror, flat(archShape(w - frame * 2, h - frame * 2)), { at: [0, centerY, 0.004] });
  b.add(M.walnut, extrude(archShape(w - 0.01, h - 0.01), 0.008, 0), { at: [0, centerY, -0.012] });
  b.add(M.brass, box(w + 0.04, 0.03, 0.22, 0.006), { at: [0, 0.015, -0.03] });
  return b;
}

/** Телевизор 65″ на центральной подставке. */
export function tv65() {
  const b = new ModelBuilder();
  const [w, h, d] = [1.45, 0.835, 0.026];
  const bottom = 0.085;
  b.add(M.blackMetal, box(w, h, d, 0.004), { at: [0, bottom + h / 2, 0] });
  b.add(M.screenBlack, box(w - 0.012, h - 0.012, 0.002, 0), { at: [0, bottom + h / 2, d / 2 + 0.001] });
  b.add(M.blackMetal, box(0.5, 0.45, 0.03, 0.01), { at: [0, bottom + 0.4, -d / 2 - 0.012] });
  b.add(M.steel, box(0.07, bottom + 0.05, 0.03, 0.006), { at: [0, (bottom + 0.05) / 2, -0.02] });
  b.add(M.steel, box(0.44, 0.012, 0.26, 0.006), { at: [0, 0.006, -0.02] });
  return b;
}

/** Двуспальная кровать 180 × 200 см с мягким изголовьем «каналы», постель из льна. */
export function bedUpholstered() {
  const b = new ModelBuilder();
  const [w, l] = [1.96, 2.12];
  const frameH = 0.34;
  b.add(M.blackMetal, box(w - 0.2, 0.06, l - 0.3, 0.004), { at: [0, 0.03, 0.05] });
  b.add(M.velvetTaupe, box(w, frameH - 0.06, l - 0.1, 0.03), { at: [0, 0.06 + (frameH - 0.06) / 2, 0.05] });
  const headZ = -l / 2 + 0.06;
  b.add(M.velvetTaupe, box(w, 1.18, 0.1, 0.02), { at: [0, 0.59, headZ] });
  const channels = 8;
  for (let i = 0; i < channels; i++) {
    const x = -w / 2 + (w / channels) * (i + 0.5);
    b.add(M.velvetTaupe, box(w / channels - 0.012, 0.86, 0.07, 0.03), { at: [x, 0.66, headZ + 0.07] });
  }
  b.add(M.linenWhite, box(1.8, 0.22, 2.0, 0.05), { at: [0, frameH + 0.11, 0.07] });
  b.add(M.linenSand, box(1.88, 0.07, 1.42, 0.03), { at: [0, frameH + 0.235, 0.39] });
  b.add(M.linenSand, box(1.86, 0.4, 0.04, 0.015), { at: [0, frameH + 0.06, 1.1] });
  [-0.45, 0.45].forEach((x) => {
    b.add(M.linenWhite, box(0.74, 0.17, 0.48, 0.07), { at: [x, frameH + 0.31, headZ + 0.42], rotate: [-0.35, 0, 0] });
    b.add(M.velvetSage, box(0.48, 0.13, 0.36, 0.05), { at: [x * 0.9, frameH + 0.32, headZ + 0.72], rotate: [-0.25, 0, 0] });
  });
  return b;
}

/** Прикроватная тумба 55 × 42 см из ореха, два ящика, латунные ручки и ножки. */
export function nightstandWalnut() {
  const b = new ModelBuilder();
  const [w, d, legH, bodyH] = [0.55, 0.42, 0.14, 0.38];
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) =>
    b.add(M.brass, cylinder(0.011, 0.008, legH), { at: [sx * (w / 2 - 0.04), legH / 2, sz * (d / 2 - 0.04)] }),
  );
  b.add(M.walnut, box(w, bodyH, d, 0.006), { at: [0, legH + bodyH / 2, 0] });
  [0.25, 0.75].forEach((t) => {
    const y = legH + bodyH * t;
    b.add(M.walnut, box(w - 0.012, bodyH / 2 - 0.008, 0.016, 0.002), { at: [0, y, d / 2 + 0.008] });
    b.add(M.brass, box(0.16, 0.01, 0.014, 0.004), { at: [0, y + 0.05, d / 2 + 0.024] });
  });
  return b;
}

/** Обеденный стол 220 × 100 см: столешница из ореха, основание из чёрного металла. */
export function diningTableWalnut() {
  const b = new ModelBuilder();
  const [w, d, h, top] = [2.2, 1.0, 0.76, 0.04];
  b.add(M.walnut, box(w, top, d, 0.012), { at: [0, h - top / 2, 0] });
  [-1, 1].forEach((side) => {
    const x = side * (w / 2 - 0.32);
    b.add(M.blackMetal, box(0.05, 0.05, d - 0.16, 0.006), { at: [x, h - top - 0.025, 0] });
    b.add(M.blackMetal, box(0.05, 0.05, d - 0.16, 0.006), { at: [x, 0.025, 0] });
    [-1, 1].forEach((sz) => b.add(M.blackMetal, box(0.05, h - top - 0.1, 0.05, 0.006), { at: [x, (h - top) / 2, sz * (d / 2 - 0.105)] }));
  });
  b.add(M.blackMetal, box(w - 0.64 - 0.05, 0.04, 0.04, 0.006), { at: [0, h - top - 0.03, 0] });
  return b;
}
