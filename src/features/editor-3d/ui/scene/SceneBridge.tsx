/**
 * Регистрирует в sceneBridge функции, которым нужен доступ к камере и рендереру,
 * и считает FPS.
 * @module editor-3d/ui/scene/SceneBridge
 */

import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Raycaster, Vector2, type Camera, type Object3D, type Scene, type WebGLRenderer } from 'three';
import { sceneBridgeStore } from '../../model/sceneBridge';
import { rayToFloor, toRay3 } from './pointer';

const JPEG_QUALITY = 0.72;

/** Отрисовать кадр без вспомогательных объектов редактора (рамки выделения, кольцо, призрак). */
function renderWithoutHelpers(gl: WebGLRenderer, scene: Scene, camera: Camera): void {
  const hidden: Object3D[] = [];
  scene.traverse((object) => {
    if (object.userData.editorHelper && object.visible) {
      object.visible = false;
      hidden.push(object);
    }
  });
  try {
    gl.render(scene, camera);
  } finally {
    hidden.forEach((object) => {
      object.visible = true;
    });
  }
}

export const SceneBridge: React.FC = () => {
  const get = useThree((s) => s.get);
  const frames = useRef({ count: 0, time: 0 });

  useEffect(() => {
    const raycaster = new Raycaster();
    /** Направить луч из камеры через экранную точку (false — холст ещё не размечен). */
    const aim = (clientX: number, clientY: number): boolean => {
      const { camera, gl } = get();
      const rect = gl.domElement.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return false;
      const ndc = new Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(ndc, camera);
      return true;
    };
    sceneBridgeStore.setState({
      screenToFloor: (clientX, clientY) => (aim(clientX, clientY) ? rayToFloor(raycaster.ray) : null),
      screenToRay: (clientX, clientY) => (aim(clientX, clientY) ? toRay3(raycaster.ray) : null),
      capture: (maxWidth) => {
        const { gl, scene, camera } = get();
        renderWithoutHelpers(gl, scene, camera);
        const source = gl.domElement;
        const width = Math.min(maxWidth, source.width);
        const height = Math.round((source.height * width) / Math.max(1, source.width));
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        canvas.getContext('2d')?.drawImage(source, 0, 0, width, height);
        return canvas.toDataURL('image/jpeg', JPEG_QUALITY);
      },
    });
    return () => sceneBridgeStore.setState({ screenToFloor: null, screenToRay: null, capture: null, fps: 0 });
  }, [get]);

  useFrame((_, delta) => {
    const f = frames.current;
    f.count += 1;
    f.time += delta;
    if (f.time >= 0.5) {
      sceneBridgeStore.setState({ fps: Math.round(f.count / f.time) });
      f.count = 0;
      f.time = 0;
    }
  });

  return null;
};
