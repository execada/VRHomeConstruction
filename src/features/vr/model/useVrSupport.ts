/**
 * Поддерживает ли браузер immersive-vr (Quest Browser, Chrome/Edge с OpenXR-рантаймом).
 * @module vr/model/useVrSupport
 */

import { useEffect, useState } from 'react';

/** Статус поддержки VR: null — проверка ещё идёт. */
export function useVrSupport(): boolean | null {
  const [supported, setSupported] = useState<boolean | null>(null);
  useEffect(() => {
    let cancelled = false;
    const xr = (navigator as Navigator & { xr?: XRSystem }).xr;
    if (!xr?.isSessionSupported) {
      setSupported(false);
      return undefined;
    }
    xr.isSessionSupported('immersive-vr')
      .then((ok) => {
        if (!cancelled) setSupported(ok);
      })
      .catch(() => {
        if (!cancelled) setSupported(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return supported;
}

/** Требуется ли HTTPS для WebXR (браузер блокирует VR на http, кроме localhost). */
export function needsSecureContext(): boolean {
  return typeof window !== 'undefined' && !window.isSecureContext;
}
