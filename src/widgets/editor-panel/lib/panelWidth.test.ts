import { describe, expect, it } from 'vitest';
import { clampPanelWidth, keyboardWidth, PANEL_WIDTH } from './panelWidth';

describe('ширина панели', () => {
  it('держится в пределах на широком окне', () => {
    expect(clampPanelWidth(400, 1920)).toBe(400);
    expect(clampPanelWidth(100, 1920)).toBe(PANEL_WIDTH.min);
    expect(clampPanelWidth(2000, 1920)).toBe(PANEL_WIDTH.max);
    expect(clampPanelWidth(333.6, 1920)).toBe(334);
  });

  it('на узком окне не занимает больше 45 % ширины, но не уже минимума', () => {
    expect(clampPanelWidth(560, 1000)).toBe(450);
    expect(clampPanelWidth(560, 400)).toBe(PANEL_WIDTH.min);
  });

  it('испорченное сохранённое значение — исходная ширина', () => {
    expect(clampPanelWidth(Number.NaN, 1920)).toBe(PANEL_WIDTH.initial);
  });

  it('клавиши: стрелки — шаг, Home и End — пределы, остальные — ничего', () => {
    expect(keyboardWidth('ArrowRight', 300)).toBe(300 + PANEL_WIDTH.step);
    expect(keyboardWidth('ArrowLeft', 300)).toBe(300 - PANEL_WIDTH.step);
    expect(keyboardWidth('Home', 300)).toBe(PANEL_WIDTH.min);
    expect(keyboardWidth('End', 300)).toBe(PANEL_WIDTH.max);
    expect(keyboardWidth('Enter', 300)).toBeNull();
  });
});
