/**
 * Модель мебели, нормализованная по габаритам: низ на y = 0, центр по X/Z.
 * Поэтому позиция предмета = точка на полу, и он никогда не «висит» и не проваливается.
 * Процедурные модели (`primitive:*`) рендерятся без файлов, glTF загружается с Suspense,
 * битый файл заменяется заглушкой, не роняя сцену.
 * @module furniture/ui/NormalizedModel
 */

import React, { Suspense, memo, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useGLTF } from '@react-three/drei';
import { Box3, Group, Vector3 } from 'three';
import { ErrorBoundary } from '@/shared/ui/error-boundary/ErrorBoundary';
import { furnitureSizesCache } from '../sizesCache';
import { applyLook, hasLook, prepareModel, type ModelLook, type ModelSizes } from '../lib/modelLook';
import { PrimitiveFurniture } from './PrimitiveFurniture';
import { PRIMITIVE_PREFIX } from '../lib/preload';


interface NormalizedModelProps {
  path: string;
  look?: ModelLook;
  /** Габариты измерены (при scale = 1) */
  onMeasured?: (sizes: ModelSizes) => void;
}

/** Сообщить габариты модели (кэш по пути + колбэк). */
function useReportSizes(path: string, sizes: ModelSizes | null, onMeasured?: (sizes: ModelSizes) => void) {
  useEffect(() => {
    if (!sizes) return;
    furnitureSizesCache.set(path, sizes);
    onMeasured?.(sizes);
  }, [path, sizes, onMeasured]);
}

const GltfModel: React.FC<Required<Pick<NormalizedModelProps, 'path' | 'look'>> & Pick<NormalizedModelProps, 'onMeasured'>> = ({
  path,
  look,
  onMeasured,
}) => {
  const { scene } = useGLTF(path);
  const prepared = useMemo(() => prepareModel(scene), [scene]);
  const lookKey = `${look.tint ?? ''}|${look.ghost ? 1 : 0}|${look.invalid ? 1 : 0}`;

  useLayoutEffect(() => {
    if (!hasLook(look)) return undefined;
    return applyLook(prepared.object, look);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- lookKey полностью описывает look
  }, [prepared, lookKey]);

  useReportSizes(path, prepared.sizes, onMeasured);

  return <primitive object={prepared.object} position={prepared.offset} />;
};

const PrimitiveModel: React.FC<Required<Pick<NormalizedModelProps, 'path' | 'look'>> & Pick<NormalizedModelProps, 'onMeasured'>> = ({
  path,
  look,
  onMeasured,
}) => {
  const ref = useRef<Group>(null);
  const [sizes, setSizes] = React.useState<ModelSizes | null>(null);

  useLayoutEffect(() => {
    if (!ref.current) return;
    const size = new Box3().setFromObject(ref.current).getSize(new Vector3());
    setSizes({ halfWidth: size.x / 2, halfDepth: size.z / 2, height: size.y });
  }, [path]);

  useReportSizes(path, sizes, onMeasured);

  return (
    <group ref={ref}>
      <PrimitiveFurniture kind={path.slice(PRIMITIVE_PREFIX.length)} look={look} />
    </group>
  );
};

/** Заглушка на время загрузки или при ошибке: бокс по известным (или стандартным) габаритам. */
const ModelPlaceholder: React.FC<{ path: string; broken?: boolean }> = ({ path, broken }) => {
  const sizes = furnitureSizesCache.get(path) ?? { halfWidth: 0.4, halfDepth: 0.4, height: 0.8 };
  return (
    <mesh position={[0, sizes.height / 2, 0]}>
      <boxGeometry args={[sizes.halfWidth * 2, sizes.height, sizes.halfDepth * 2]} />
      <meshStandardMaterial color={broken ? '#e5484d' : '#c9c3b8'} transparent opacity={broken ? 0.5 : 0.35} depthWrite={false} />
    </mesh>
  );
};

const NO_LOOK: ModelLook = {};

/** Нормализованная модель мебели. */
export const NormalizedModel: React.FC<NormalizedModelProps> = memo(({ path, look = NO_LOOK, onMeasured }) => {
  if (path.startsWith(PRIMITIVE_PREFIX)) {
    return <PrimitiveModel path={path} look={look} onMeasured={onMeasured} />;
  }
  return (
    <ErrorBoundary fallback={<ModelPlaceholder path={path} broken />} context={`модель ${path}`} resetKey={path}>
      <Suspense fallback={<ModelPlaceholder path={path} />}>
        <GltfModel path={path} look={look} onMeasured={onMeasured} />
      </Suspense>
    </ErrorBoundary>
  );
});
