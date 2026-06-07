/**
 * @file Lock.tsx
 * @description The installed mobile app's launch screen. It shows only the
 *   golden sun over the Andean mountains, never the public landing. Tapping
 *   the sun three times opens the door: straight into the reserved area if a
 *   session exists, otherwise to the login. A hidden accessible fallback is
 *   provided by the SecretDoor component.
 */

import { SecretDoor } from '@/components/lodge/SecretDoor';
import { MountainRidge } from '@/components/lodge/LodgeMarks';

export default function Lock() {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-[#0B0B0D] px-6 text-[#ECE7DA]">
      {/* Faint vignette */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: 'radial-gradient(circle at 50% 42%, #1b1622 0%, #0c0b0e 55%, #0B0B0D 80%)' }}
        aria-hidden="true"
      />

      {/* The sun: the hidden entrance */}
      <div className="relative z-10 flex flex-col items-center text-center">
        <SecretDoor size={184} spin />
        <h1 className="font-display mt-8 text-3xl font-semibold leading-none">Logia Simón Bolívar</h1>
        <span className="mt-3 text-[0.7rem] uppercase tracking-[0.3em] text-[#C8A24B]">Nº 646</span>
        <p className="font-display mt-5 text-lg italic text-[#ECE7DA]/70">«Ciencia, Justicia, Trabajo»</p>
      </div>

      {/* Andean mountains at the foot */}
      <MountainRidge className="pointer-events-none absolute bottom-0 left-0 z-0 h-[34vh] w-full" />
    </div>
  );
}
