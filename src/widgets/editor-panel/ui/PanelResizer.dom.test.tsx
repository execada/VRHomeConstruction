// @vitest-environment jsdom
import React, { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PANEL_WIDTH } from '../lib/panelWidth';
import { PanelResizer } from './PanelResizer';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mounted: Root[] = [];

/** Разделитель с шириной в состоянии, как в панели. */
function setup() {
  const onReset = vi.fn();
  const Harness: React.FC = () => {
    const [width, setWidth] = useState<number>(PANEL_WIDTH.initial);
    return <PanelResizer width={width} onChange={setWidth} onReset={onReset} />;
  };
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(<Harness />));
  mounted.push(root);
  const handle = container.querySelector<HTMLElement>('[role="separator"]')!;
  const width = () => Number(handle.getAttribute('aria-valuenow'));
  const fire = (type: string, init: MouseEventInit = {}) => act(() => void handle.dispatchEvent(new MouseEvent(type, { bubbles: true, ...init })));
  const press = (key: string) => act(() => void handle.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true })));
  return { handle, width, fire, press, onReset };
}

afterEach(() => {
  mounted.splice(0).forEach((root) => act(() => root.unmount()));
  document.body.innerHTML = '';
});

describe('разделитель ширины панели', () => {
  it('доступен с клавиатуры как разделитель окна', () => {
    const { handle, width } = setup();
    expect(handle.getAttribute('aria-orientation')).toBe('vertical');
    expect(handle.tabIndex).toBe(0);
    expect(width()).toBe(PANEL_WIDTH.initial);
  });

  it('тянется мышью: ширина следует за указателем, после отпускания — не меняется', () => {
    const { width, fire } = setup();
    fire('pointerdown', { clientX: 100, button: 0 });
    fire('pointermove', { clientX: 160 });
    expect(width()).toBe(PANEL_WIDTH.initial + 60);
    fire('pointerup', { clientX: 160 });
    fire('pointermove', { clientX: 400 });
    expect(width()).toBe(PANEL_WIDTH.initial + 60);
  });

  it('правая кнопка мыши не тянет', () => {
    const { width, fire } = setup();
    fire('pointerdown', { clientX: 100, button: 2 });
    fire('pointermove', { clientX: 200 });
    expect(width()).toBe(PANEL_WIDTH.initial);
  });

  it('стрелки меняют ширину на шаг, Home и End — к пределам; двойной клик — исходная ширина', () => {
    const { width, press, fire, onReset } = setup();
    press('ArrowRight');
    expect(width()).toBe(PANEL_WIDTH.initial + PANEL_WIDTH.step);
    press('End');
    expect(width()).toBe(PANEL_WIDTH.max);
    press('Home');
    expect(width()).toBe(PANEL_WIDTH.min);
    press('a');
    expect(width()).toBe(PANEL_WIDTH.min);
    fire('dblclick');
    expect(onReset).toHaveBeenCalledTimes(1);
  });
});
