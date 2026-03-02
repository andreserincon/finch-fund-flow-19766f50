/**
 * @file useOrientationToggle.ts
 * @description Hook that lets mobile users toggle between portrait
 *   and landscape orientation. Uses the Screen Orientation API when
 *   available; falls back gracefully when not supported.
 */

import { useState, useCallback, useEffect } from 'react';

type OrientationMode = 'auto' | 'landscape';

export function useOrientationToggle() {
  const [mode, setMode] = useState<OrientationMode>('auto');

  /** Track the device's actual orientation via window dimensions */
  const [isNativeLandscape, setIsNativeLandscape] = useState(
    () => window.innerWidth > window.innerHeight
  );

  useEffect(() => {
    const handleResize = () => {
      setIsNativeLandscape(window.innerWidth > window.innerHeight);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  /** Toggle between auto (portrait) and forced landscape */
  const toggle = useCallback(async () => {
    const next = mode === 'auto' ? 'landscape' : 'auto';

    try {
      const orientation = screen?.orientation;
      if (orientation?.lock) {
        if (next === 'landscape') {
          await orientation.lock('landscape');
        } else {
          orientation.unlock();
        }
      }
    } catch {
      // Screen Orientation API not supported or not in fullscreen – ignore
    }

    setMode(next);
  }, [mode]);

  return {
    mode,
    /** True when forced landscape OR device is naturally landscape */
    isLandscape: mode === 'landscape' || isNativeLandscape,
    toggle,
  };
}
