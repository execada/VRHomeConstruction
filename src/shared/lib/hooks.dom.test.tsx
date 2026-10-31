// @vitest-environment jsdom
import React, { act, useRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { useModalBehavior } from '@/shared/ui/overlay/useModalBehavior';
import { createExternalStore, useExternalStore } from './externalStore';
import { useStoredState } from './useStoredState';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mounted: Array<{ root: Root; container: HTMLElement }> = [];

function render(element: React.ReactElement) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(element));
  mounted.push({ root, container });
  return { container, unmount: () => act(() => root.unmount()) };
}

afterEach(() => {
  mounted.splice(0).forEach(({ root, container }) => {
    act(() => root.unmount());
    container.remove();
  });
  localStorage.clear();
});

describe('useStoredState', () => {
  const Counter: React.FC = () => {
    const [value, setValue] = useStoredState('counter', z.number(), 1);
    return (
      <button type="button" onClick={() => setValue(value + 1)}>
        {value}
      </button>
    );
  };

  it('читает сохранённое значение и записывает новое', () => {
    localStorage.setItem('vrhc:counter', '5');
    const { container } = render(<Counter />);
    const button = container.querySelector('button') as HTMLButtonElement;
    expect(button.textContent).toBe('5');
    act(() => button.click());
    expect(button.textContent).toBe('6');
    expect(localStorage.getItem('vrhc:counter')).toBe('6');
  });

  it('повреждённое значение заменяется значением по умолчанию', () => {
    localStorage.setItem('vrhc:counter', '"oops"');
    const { container } = render(<Counter />);
    expect(container.textContent).toBe('1');
  });
});

describe('useExternalStore', () => {
  it('перерисовывает компонент при изменении выбранной части', () => {
    const store = createExternalStore({ count: 0, other: 'a' });
    let renders = 0;
    const View: React.FC = () => {
      renders += 1;
      return <span>{useExternalStore(store, (s) => s.count)}</span>;
    };
    const { container } = render(<View />);
    act(() => store.setState({ count: 2 }));
    expect(container.textContent).toBe('2');
    const before = renders;
    act(() => store.setState({ other: 'b' }));
    expect(renders).toBe(before);
  });
});

describe('useModalBehavior', () => {
  const Modal: React.FC<{ onClose: () => void; label: string; withInput?: boolean }> = ({ onClose, label, withInput }) => {
    const ref = useRef<HTMLDivElement>(null);
    useModalBehavior(ref, onClose);
    return (
      <div ref={ref} tabIndex={-1} aria-label={label}>
        {withInput && <input aria-label="поле" autoFocus />}
      </div>
    );
  };

  const pressEscape = () => act(() => void window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));

  it('переводит фокус внутрь и возвращает его после закрытия', () => {
    const opener = document.createElement('button');
    document.body.appendChild(opener);
    opener.focus();
    const { unmount } = render(<Modal onClose={() => undefined} label="окно" />);
    expect(document.activeElement?.getAttribute('aria-label')).toBe('окно');
    unmount();
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });

  it('не отнимает фокус у поля с autoFocus', () => {
    render(<Modal onClose={() => undefined} label="окно" withInput />);
    expect(document.activeElement?.getAttribute('aria-label')).toBe('поле');
  });

  it('Esc закрывает только верхнее окно', () => {
    const closeDrawer = vi.fn();
    const closeDialog = vi.fn();
    render(<Modal onClose={closeDrawer} label="панель" />);
    const dialog = render(<Modal onClose={closeDialog} label="диалог" />);
    pressEscape();
    expect(closeDialog).toHaveBeenCalledTimes(1);
    expect(closeDrawer).not.toHaveBeenCalled();
    dialog.unmount();
    pressEscape();
    expect(closeDrawer).toHaveBeenCalledTimes(1);
  });

  it('использует актуальный обработчик без перезапуска эффекта', () => {
    const first = vi.fn();
    const second = vi.fn();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => root.render(<Modal onClose={first} label="окно" />));
    act(() => root.render(<Modal onClose={second} label="окно" />));
    pressEscape();
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
    act(() => root.unmount());
    container.remove();
  });
});
