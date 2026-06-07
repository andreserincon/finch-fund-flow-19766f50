/**
 * @file useIsStandalone.ts
 * @description Detects whether the app is running as an installed PWA
 *   (standalone display mode) rather than in a normal browser tab. Used to
 *   show the lock screen (sun over mountains) instead of the public landing
 *   when the mobile app is opened.
 */

import { useEffect, useState } from 'react';

function check(): boolean {
  if (typeof window === 'undefined') return false;
  const mq = window.matchMedia('(display-mode: standalone)').matches;
  // iOS Safari exposes navigator.standalone for home-screen apps
  const iosStandalone = (window.navigator as unknown as { standalone?: boolean }).standalone === true;
  return mq || iosStandalone;
}

export function useIsStandalone(): boolean {
  const [standalone, setStandalone] = useState<boolean>(check);

  useEffect(() => {
    const mq = window.matchMedia('(display-mode: standalone)');
    const onChange = () => setStandalone(check());
    mq.addEventListener?.('change', onChange);
    return () => mq.removeEventListener?.('change', onChange);
  }, []);

  return standalone;
}
