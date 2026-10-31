/**
 * Применяет тему оформления (светлая / тёмная / как в системе) к <html data-theme>.
 * В режиме «как в системе» следит за prefers-color-scheme.
 * @module app/providers/ThemeProvider
 */

import { useEffect, type ReactNode } from 'react';
import { useSelector } from 'react-redux';
import { ThemeFeature } from '@/features/theme';

const DARK_QUERY = '(prefers-color-scheme: dark)';

export const ThemeProvider = ({ children }: { children: ReactNode }) => {
  const mode = useSelector(ThemeFeature.selectors.selectThemeMode);

  useEffect(() => {
    const root = document.documentElement;
    if (mode !== 'system') {
      root.dataset.theme = mode;
      return undefined;
    }
    const media = window.matchMedia(DARK_QUERY);
    const apply = () => {
      root.dataset.theme = media.matches ? 'dark' : 'light';
    };
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [mode]);

  return <>{children}</>;
};
