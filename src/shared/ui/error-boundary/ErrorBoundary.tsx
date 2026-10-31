/**
 * Граница ошибок: изолирует сбой (например, битый файл модели), показывая запасной UI
 * вместо падения всей сцены. Ошибка логируется с контекстом.
 * @module shared/ui/error-boundary/ErrorBoundary
 */

import { Component, type ErrorInfo, type ReactNode } from 'react';

interface ErrorBoundaryProps {
  /** Что показать вместо упавшего поддерева */
  fallback: ReactNode;
  /** Контекст для лога (например, путь к модели) */
  context?: string;
  /** Сбросить ошибку при изменении ключа */
  resetKey?: string;
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
  resetKey?: string;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null, resetKey: this.props.resetKey };

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { error };
  }

  static getDerivedStateFromProps(props: ErrorBoundaryProps, state: ErrorBoundaryState): Partial<ErrorBoundaryState> | null {
    return props.resetKey !== state.resetKey ? { error: null, resetKey: props.resetKey } : null;
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(`Ошибка в компоненте${this.props.context ? ` (${this.props.context})` : ''}`, error, info.componentStack);
  }

  render(): ReactNode {
    return this.state.error ? this.props.fallback : this.props.children;
  }
}
