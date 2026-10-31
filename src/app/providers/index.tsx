import React, { ReactNode } from 'react';
import { ThemeProvider } from './ThemeProvider';

interface ProvidersProps {
  children: ReactNode;
}

export const AppProviders = ({ children }: ProvidersProps) => {
  return <ThemeProvider>{children}</ThemeProvider>;
};
