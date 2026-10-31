/**
 * Процедурная мебель из составных примитивов (боксы/цилиндры/сферы).
 * Путь вида `primitive:<kind>` рендерится без загрузки файлов (VR-friendly).
 * Модели построены нормализованными: низ на y = 0, центр по X/Z, фасад смотрит в +Z.
 * @module furniture/ui/PrimitiveFurniture
 */

import React from 'react';
import { Color } from 'three';
import type { ModelLook } from '../lib/modelLook';

/** Палитра примитивов. */
const C = {
  fabric: '#8d9aa8',
  fabricDark: '#6c7886',
  wood: '#a07850',
  woodDark: '#7a5a3a',
  metal: '#b9bec9',
  white: '#f2f3f5',
  dark: '#2b2f3a',
  screen: '#11141c',
  green: '#4e8c53',
  terracotta: '#b06a4a',
  glass: '#aac4d4',
};

/** Свойства материала с учётом тонирования и призрака. */
function surface(color: string, look: ModelLook, roughness: number) {
  const base = new Color(color);
  if (look.tint) base.multiply(new Color(look.tint));
  return {
    color: base,
    roughness,
    transparent: Boolean(look.ghost || look.invalid),
    opacity: look.ghost || look.invalid ? 0.6 : 1,
    depthWrite: !(look.ghost || look.invalid),
    emissive: look.invalid ? '#7a1a1d' : '#000000',
  };
}

const LookContext = React.createContext<ModelLook>({});

const Bx: React.FC<{ args: [number, number, number]; pos: [number, number, number]; color: string; rough?: number }> = ({
  args,
  pos,
  color,
  rough = 0.85,
}) => {
  const look = React.useContext(LookContext);
  return (
    <mesh position={pos} castShadow={!look.ghost} receiveShadow>
      <boxGeometry args={args} />
      <meshStandardMaterial {...surface(color, look, rough)} />
    </mesh>
  );
};

const Cyl: React.FC<{
  args: [number, number, number, number?];
  pos: [number, number, number];
  color: string;
  rot?: [number, number, number];
}> = ({ args, pos, color, rot }) => {
  const look = React.useContext(LookContext);
  return (
    <mesh position={pos} rotation={rot} castShadow={!look.ghost} receiveShadow>
      <cylinderGeometry args={[args[0], args[1], args[2], args[3] ?? 24]} />
      <meshStandardMaterial {...surface(color, look, 0.8)} />
    </mesh>
  );
};

const Ball: React.FC<{ r: number; pos: [number, number, number]; color: string }> = ({ r, pos, color }) => {
  const look = React.useContext(LookContext);
  return (
    <mesh position={pos} castShadow={!look.ghost}>
      <sphereGeometry args={[r, 20, 16]} />
      <meshStandardMaterial {...surface(color, look, 0.9)} />
    </mesh>
  );
};

const Sofa = () => (
  <>
    <Bx args={[1.8, 0.35, 0.85]} pos={[0, 0.175, 0]} color={C.fabric} />
    <Bx args={[1.8, 0.5, 0.22]} pos={[0, 0.6, -0.315]} color={C.fabricDark} />
    <Bx args={[0.22, 0.32, 0.85]} pos={[-0.79, 0.51, 0]} color={C.fabricDark} />
    <Bx args={[0.22, 0.32, 0.85]} pos={[0.79, 0.51, 0]} color={C.fabricDark} />
    <Bx args={[0.82, 0.12, 0.7]} pos={[-0.44, 0.41, 0.05]} color={C.fabric} />
    <Bx args={[0.82, 0.12, 0.7]} pos={[0.44, 0.41, 0.05]} color={C.fabric} />
  </>
);

const Stool = () => (
  <>
    <Cyl args={[0.19, 0.19, 0.06]} pos={[0, 0.45, 0]} color={C.fabricDark} />
    <Cyl args={[0.04, 0.05, 0.42]} pos={[0, 0.21, 0]} color={C.metal} />
    <Cyl args={[0.16, 0.16, 0.03]} pos={[0, 0.015, 0]} color={C.metal} />
  </>
);

const legs = (x: number, z: number, h: number, color: string) =>
  [
    [-x, -z],
    [x, -z],
    [-x, z],
    [x, z],
  ].map(([lx, lz]) => <Bx key={`${lx}_${lz}`} args={[0.05, h, 0.05]} pos={[lx, h / 2, lz]} color={color} />);

const CoffeeTable = () => (
  <>
    <Bx args={[1.0, 0.05, 0.6]} pos={[0, 0.425, 0]} color={C.wood} rough={0.6} />
    {legs(0.45, 0.25, 0.4, C.woodDark)}
  </>
);

const Desk = () => (
  <>
    <Bx args={[1.4, 0.05, 0.7]} pos={[0, 0.725, 0]} color={C.wood} rough={0.6} />
    <Bx args={[0.05, 0.7, 0.7]} pos={[-0.675, 0.35, 0]} color={C.woodDark} />
    <Bx args={[0.05, 0.7, 0.7]} pos={[0.675, 0.35, 0]} color={C.woodDark} />
    <Bx args={[0.4, 0.45, 0.65]} pos={[0.47, 0.5, 0]} color={C.woodDark} />
  </>
);

const Shelf = () => (
  <>
    <Bx args={[0.04, 1.8, 0.32]} pos={[-0.42, 0.9, 0]} color={C.woodDark} />
    <Bx args={[0.04, 1.8, 0.32]} pos={[0.42, 0.9, 0]} color={C.woodDark} />
    {[0.1, 0.5, 0.9, 1.3, 1.7].map((y) => (
      <Bx key={y} args={[0.8, 0.04, 0.3]} pos={[0, y, 0]} color={C.wood} />
    ))}
  </>
);

const TvStand = () => (
  <>
    <Bx args={[1.4, 0.4, 0.42]} pos={[0, 0.2, 0]} color={C.woodDark} rough={0.6} />
    <Bx args={[1.1, 0.64, 0.05]} pos={[0, 0.78, 0]} color={C.dark} />
    <Bx args={[1.02, 0.56, 0.02]} pos={[0, 0.78, 0.025]} color={C.screen} rough={0.3} />
  </>
);

const Fridge = () => (
  <>
    <Bx args={[0.7, 1.8, 0.7]} pos={[0, 0.9, 0]} color={C.white} rough={0.4} />
    <Bx args={[0.7, 0.02, 0.7]} pos={[0, 1.2, 0]} color={C.metal} />
    <Bx args={[0.03, 0.5, 0.04]} pos={[0.3, 1.5, 0.36]} color={C.metal} />
    <Bx args={[0.03, 0.7, 0.04]} pos={[0.3, 0.7, 0.36]} color={C.metal} />
  </>
);

const WashingMachine = () => (
  <>
    <Bx args={[0.6, 0.85, 0.6]} pos={[0, 0.425, 0]} color={C.white} rough={0.4} />
    <Cyl args={[0.2, 0.2, 0.03]} pos={[0, 0.42, 0.3]} color={C.glass} rot={[Math.PI / 2, 0, 0]} />
    <Bx args={[0.6, 0.1, 0.02]} pos={[0, 0.78, 0.3]} color={C.metal} />
  </>
);

const FloorLamp = () => (
  <>
    <Cyl args={[0.18, 0.18, 0.04]} pos={[0, 0.02, 0]} color={C.dark} />
    <Cyl args={[0.02, 0.025, 1.5]} pos={[0, 0.79, 0]} color={C.metal} />
    <Cyl args={[0.14, 0.22, 0.32]} pos={[0, 1.68, 0]} color="#e8dcc0" />
  </>
);

const Plant = () => (
  <>
    <Cyl args={[0.18, 0.13, 0.3]} pos={[0, 0.15, 0]} color={C.terracotta} />
    <Cyl args={[0.03, 0.04, 0.5]} pos={[0, 0.5, 0]} color={C.woodDark} />
    <Ball r={0.36} pos={[0, 0.95, 0]} color={C.green} />
    <Ball r={0.22} pos={[0.2, 0.75, 0.1]} color="#5da162" />
  </>
);

/** Ковёр нейтральных тонов (кайма + поле): хорошо тонируется в любой цвет. */
const Rug = () => (
  <>
    <Bx args={[2.0, 0.02, 1.4]} pos={[0, 0.01, 0]} color="#8b7b67" rough={1} />
    <Bx args={[1.7, 0.022, 1.1]} pos={[0, 0.011, 0]} color="#cdbda6" rough={1} />
  </>
);

const KitchenCounter = () => (
  <>
    <Bx args={[1.2, 0.88, 0.6]} pos={[0, 0.44, 0]} color={C.white} rough={0.5} />
    <Bx args={[1.24, 0.05, 0.64]} pos={[0, 0.905, 0]} color={C.dark} rough={0.4} />
    <Bx args={[0.02, 0.6, 0.04]} pos={[-0.3, 0.5, 0.31]} color={C.metal} />
    <Bx args={[0.02, 0.6, 0.04]} pos={[0.3, 0.5, 0.31]} color={C.metal} />
  </>
);

const Mirror = () => (
  <>
    <Bx args={[0.7, 1.7, 0.06]} pos={[0, 0.85, 0]} color={C.woodDark} rough={0.5} />
    <Bx args={[0.58, 1.58, 0.02]} pos={[0, 0.85, 0.035]} color={C.glass} rough={0.05} />
  </>
);

const Placeholder = () => <Bx args={[0.5, 0.5, 0.5]} pos={[0, 0.25, 0]} color={C.metal} />;

const KINDS: Record<string, React.FC> = {
  sofa: Sofa,
  stool: Stool,
  coffee_table: CoffeeTable,
  desk: Desk,
  shelf: Shelf,
  tv_stand: TvStand,
  fridge: Fridge,
  washing_machine: WashingMachine,
  floor_lamp: FloorLamp,
  plant: Plant,
  rug: Rug,
  kitchen_counter: KitchenCounter,
  mirror: Mirror,
};

/** Процедурная модель. Неизвестный вид — куб-заглушка, чтобы сцена не падала. */
export const PrimitiveFurniture: React.FC<{ kind: string; look: ModelLook }> = ({ kind, look }) => {
  const Shape = KINDS[kind] ?? Placeholder;
  return (
    <LookContext.Provider value={look}>
      <Shape />
    </LookContext.Provider>
  );
};
