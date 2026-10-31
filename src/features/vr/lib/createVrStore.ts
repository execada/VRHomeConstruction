/**
 * Настройки WebXR-сессии для автономных шлемов (Meta Quest 3/3+) и PC VR
 * (Chrome/Edge + Quest Link / Air Link / SteamVR через OpenXR).
 * Фовеация и высокая частота кадров — для стабильных 72–90 FPS на Quest.
 * Детекция плоскостей/мешей/якорей не запрашивается: интерьер виртуальный,
 * а лишние разрешения на «пространственные данные» пугают пользователей.
 * @module vr/lib/createVrStore
 */

import { createXRStore } from '@react-three/xr';

const isDev = process.env.NODE_ENV === 'development';

/** Создать store XR-сессии (один на страницу редактора). */
export function createVrStore() {
  return createXRStore({
    // Эмулятор Quest 3 только для разработки на localhost и без загрузки сетевых окружений.
    emulate: isDev ? { type: 'metaQuest3', syntheticEnvironment: false } : false,
    // Браузер шлема сам предложит «Войти в VR» (кнопка в интерфейсе Quest Browser).
    offerSession: 'immersive-vr',
    foveation: 0.6,
    frameRate: 'high',
    handTracking: true,
    anchors: false,
    meshDetection: false,
    planeDetection: false,
    hitTest: false,
    bodyTracking: false,
    domOverlay: false,
    controller: { teleportPointer: true, rayPointer: { rayModel: { color: '#c9a96e' } } },
    hand: { teleportPointer: true },
  });
}

export type VrStore = ReturnType<typeof createVrStore>;
