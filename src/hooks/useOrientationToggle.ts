import { useState, useCallback, useEffect } from 'react';

type OrientationMode = 'auto' | 'landscape';

export function useOrientationToggle() {
  const [mode, setMode] = useState<OrientationMode>('auto');

  // Detect if currently in landscape via native orientation
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
      // Screen Orientation API not supported or not in fullscreen
    }

    setMode(next);
  }, [mode]);

  return {
    mode,
    isLandscape: mode === 'landscape' || isNativeLandscape,
    toggle,
  };
}
