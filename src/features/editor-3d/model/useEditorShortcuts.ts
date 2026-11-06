/**
 * Горячие клавиши редактора. Не срабатывают при вводе текста в полях.
 * Esc — отмена размещения/инструмента/выделения; Del — удалить; Ctrl+D — копия;
 * Ctrl+Z / Ctrl+Shift+Z (Ctrl+Y) — отмена/повтор; Ctrl+S — сохранить;
 * R / Shift+R — поворот на 90° (Alt — на 15°; лестница — всегда на 90°); стрелки — сдвиг на 5 см
 * (Shift — 1 см); G — сетка; L — закрепить; 1/2/3/4 — облёт / от первого лица / план / улица.
 * @module editor-3d/model/useEditorShortcuts
 */

import { useEffect } from 'react';
import { useDispatch, useStore } from 'react-redux';
import type { RootState } from '@/app/store';
import { CameraFeature, type CameraMode } from '@/features/camera';
import { HistoryFeature } from '@/features/history';
import { ProjectSessionFeature } from '@/features/project-session';
import { actions as editorActions } from '../slice';
import { ghostAim, interaction, interactionStore, ROTATE_STEP } from './interactionStore';
import { useSceneCommands } from './useSceneCommands';

const NUDGE = 0.05;
const NUDGE_FINE = 0.01;

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return Boolean(el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable));
}

const CAMERA_KEYS: Record<string, CameraMode> = { '1': 'orbit', '2': 'fps', '3': 'top', '4': 'street' };

const ARROWS: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

export function useEditorShortcuts(): void {
  const dispatch = useDispatch();
  const store = useStore<RootState>();
  const commands = useSceneCommands();

  useEffect(() => {
    const rotate = (delta: number) => {
      const s = interactionStore.getState();
      if (s.placingStair) {
        interaction.rotateStair(Math.sign(delta) * (Math.PI / 2));
        const ghost = interactionStore.getState().stairGhost;
        if (ghost) interaction.setStairGhost(commands.stairs.preview(s.stairKind, ghost.stair.position, interactionStore.getState().stairAngle));
        return;
      }
      if (s.mode === 'placing' && s.placingPath) {
        interaction.rotatePlacing(delta);
        const ghost = s.ghost;
        const angle = interactionStore.getState().placingAngle;
        // Повернуть призрак на той же поверхности (или на полу), где он стоит.
        if (ghost) interaction.setGhost(commands.furniture.previewPlacement(s.placingPath, ghost.center, angle, { name: s.placingName ?? '', aim: ghostAim(ghost) }));
        return;
      }
      commands.rotateSelection(delta);
    };

    const onEscape = () => {
      if (interactionStore.getState().mode === 'placing') return interaction.reset();
      const draft = interactionStore.getState().wallDraft;
      if (draft?.start) return interaction.setWallDraft({ ...draft, start: null });
      if (store.getState().editor.activeTool !== 'select') return dispatch(editorActions.setActiveTool('select'));
      return commands.select(null);
    };

    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target) || e.defaultPrevented) return;
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      if (mod && key === 'z') {
        e.preventDefault();
        dispatch(e.shiftKey ? HistoryFeature.actions.redoRequested() : HistoryFeature.actions.undoRequested());
      } else if (mod && key === 'y') {
        e.preventDefault();
        dispatch(HistoryFeature.actions.redoRequested());
      } else if (mod && key === 's') {
        e.preventDefault();
        dispatch(ProjectSessionFeature.actions.saveNowRequested());
      } else if (mod && key === 'd') {
        e.preventDefault();
        commands.duplicateSelection();
      } else if (mod) {
        return;
      } else if (e.key === 'Escape') {
        onEscape();
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        commands.deleteSelection();
      } else if (key === 'r' || e.code === 'KeyR') {
        const step = e.altKey ? ROTATE_STEP : Math.PI / 2;
        rotate(e.shiftKey ? step : -step);
      } else if (key === 'g' || e.code === 'KeyG') {
        interaction.toggleGrid();
      } else if (key === 'l' || e.code === 'KeyL') {
        const sel = store.getState().selection.current;
        if (sel?.kind === 'furniture') commands.furniture.toggleLock(sel.id);
      } else if (ARROWS[e.key]) {
        e.preventDefault();
        const [dx, dz] = ARROWS[e.key];
        const step = e.shiftKey ? NUDGE_FINE : NUDGE;
        commands.nudgeSelection(dx * step, dz * step);
      } else if (CAMERA_KEYS[e.key]) {
        dispatch(CameraFeature.actions.setMode(CAMERA_KEYS[e.key]));
      }
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dispatch, store, commands]);
}
