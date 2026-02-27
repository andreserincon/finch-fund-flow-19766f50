import { useState, useCallback } from 'react';

type OrientationMode = 'auto' | 'landscape';

export function useOrientationToggle() {
  const [mode, setMode] = useState<OrientationMode>('auto');

  const toggle = useCallback(async () => {
    const next = mode === 'auto' ? 'landscape' : 'auto';

    // Try native Screen Orientation API (works in fullscreen / some PWAs)
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
      // Silently fall back to CSS rotation
    }

    setMode(next);
  }, [mode]);

  return { mode, isLandscape: mode === 'landscape', toggle };
}
