/**
 * Инструменты контроллеров в VR: пока предмет захвачен лучом (курок), правый стик
 * поворачивает его по 15°; захват и отпускание подтверждаются вибрацией.
 * @module vr/ui/VrDragTools
 */

import React, { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useXRInputSourceState } from '@react-three/xr';
import { useSceneCommands } from '@/features/editor-3d/model/useSceneCommands';
import { interactionStore, ROTATE_STEP } from '@/features/editor-3d/model/interactionStore';

const STICK_THRESHOLD = 0.6;
const REPEAT_SECONDS = 0.28;

type Haptic = { pulse?: (value: number, duration: number) => Promise<boolean> };

/** Короткая вибрация контроллера (если поддерживается). */
function pulse(inputSource: XRInputSource | undefined, intensity: number, ms: number): void {
  const actuator = (inputSource?.gamepad as (Gamepad & { hapticActuators?: Haptic[] }) | undefined)?.hapticActuators?.[0];
  actuator?.pulse?.(intensity, ms).catch(() => undefined);
}

export const VrDragTools: React.FC = () => {
  const commands = useSceneCommands();
  const right = useXRInputSourceState('controller', 'right');
  const left = useXRInputSourceState('controller', 'left');
  const cooldown = useRef(0);

  useEffect(() => {
    let previous = interactionStore.getState().mode;
    return interactionStore.subscribe(() => {
      const { mode } = interactionStore.getState();
      if (mode !== previous && (mode === 'dragging' || previous === 'dragging')) {
        pulse(right?.inputSource, 0.4, 30);
        pulse(left?.inputSource, 0.25, 20);
      }
      previous = mode;
    });
  }, [right, left]);

  useFrame((_, delta) => {
    const { mode, activeId } = interactionStore.getState();
    cooldown.current = Math.max(0, cooldown.current - delta);
    if (mode !== 'dragging' || !activeId || cooldown.current > 0) return;
    const x = right?.gamepad['xr-standard-thumbstick']?.xAxis ?? 0;
    if (Math.abs(x) < STICK_THRESHOLD) return;
    commands.furniture.rotateBy(activeId, -Math.sign(x) * ROTATE_STEP);
    cooldown.current = REPEAT_SECONDS;
    pulse(right?.inputSource, 0.15, 15);
  });

  return null;
};
