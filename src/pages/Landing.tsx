/**
 * @file Landing.tsx
 * @description The public front door (web only). Black, white, and gold, with
 *   the lodge identity. The hero sun is the hidden entrance to the reserved
 *   area: tapping it three times opens the door (see SecretDoor). There is no
 *   visible "members" button by design.
 *
 *   NOTE: this is the entrance-complete version. The remaining landing content
 *   (self-qualification, FAQ, and the public contact form) is ported in the
 *   next step.
 */

import { SecretDoor } from '@/components/lodge/SecretDoor';
import { MountainRidge, SquareCompass } from '@/components/lodge/LodgeMarks';

export default function Landing() {
  return (
    <div className="min-h-screen bg-[#0B0B0D] font-sans text-[#ECE7DA]">
      {/* Header (no members button; the way in is the sun) */}
      <header className="sticky top-0 z-40 border-b border-[#C8A24B]/15 bg-[#0B0B0D]/80 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-7 py-4">
          <div className="font-display text-lg font-semibold tracking-wide">Logia Simón Bolívar Nº 646</div>
          <nav className="hidden gap-7 text-[0.72rem] uppercase tracking-[0.16em] text-[#ECE7DA]/70 md:flex">
            <a className="transition-colors hover:text-[#C8A24B]" href="#logia">Nuestra Logia</a>
            <a className="transition-colors hover:text-[#C8A24B]" href="#masoneria">La Masonería</a>
            <a className="transition-colors hover:text-[#C8A24B]" href="#camino">Cómo Acercarse</a>
          </nav>
        </div>
      </header>

      {/* Hero: the sun is the secret door */}
      <section className="relative flex min-h-[92vh] flex-col items-center justify-center overflow-hidden px-6 pb-[24vh] pt-24 text-center">
        <div
          className="pointer-events-none absolute inset-0 z-0"
          style={{ background: 'radial-gradient(circle at 50% 40%, #1b1622 0%, #0c0b0e 52%, #0B0B0D 80%)' }}
          aria-hidden="true"
        />
        {/* The sun: the big faint sunburst is the hidden entrance, behind the text */}
        <div className="absolute left-1/2 top-[44%] z-[1] -translate-x-1/2 -translate-y-1/2">
          <SecretDoor size="122vmin" dim={0.42} spin />
        </div>

        <div className="pointer-events-none relative z-10 flex flex-col items-center">
          <h1 className="font-display text-4xl font-semibold leading-[1.05] sm:text-6xl">
            Respetable Logia Simón Bolívar
          </h1>
          <span className="mt-4 text-[0.72rem] uppercase tracking-[0.4em] text-[#C8A24B]">Nº 646</span>
          <p className="mt-6 text-[0.76rem] uppercase tracking-[0.24em] text-[#ECE7DA]/55">
            Oriente de Buenos Aires · Fundada en 2018
          </p>
          <p className="font-display mt-6 text-2xl italic text-[#ECE7DA]/75">«Ciencia, Justicia, Trabajo»</p>
        </div>
        <MountainRidge className="pointer-events-none absolute bottom-0 left-0 z-0 h-[34vh] w-full" />
      </section>

      {/* Nuestra Logia */}
      <section id="logia" className="border-t border-[#C8A24B]/12 px-7 py-24">
        <div className="mx-auto max-w-3xl">
          <p className="text-[0.72rem] uppercase tracking-[0.3em] text-[#C8A24B]">Nuestra Logia</p>
          <h2 className="font-display mt-4 text-3xl font-semibold sm:text-4xl">Un hogar fraterno al Sur</h2>
          <hr className="rule-gold mt-5" />
          <p className="mt-8 text-lg leading-relaxed text-[#ECE7DA]/90">
            Fundada el 23 de enero de 2018 al Oriente de Buenos Aires, somos una logia masónica regular que trabaja
            bajo la obediencia de la Gran Logia de la Argentina.
          </p>
          <p className="mt-5 leading-relaxed text-[#ECE7DA]/72">
            Nació como hogar fraterno para quienes, lejos de su tierra, hallaron en los principios masónicos una patria
            común y un refugio de luz. Hoy reúne a hombres de distintos oficios y orígenes que comparten una misma
            búsqueda.
          </p>
        </div>
      </section>

      {/* La Masonería */}
      <section id="masoneria" className="border-t border-[#C8A24B]/12 bg-gradient-to-b from-[#0e0e11] to-[#0B0B0D] px-7 py-24">
        <div className="mx-auto max-w-3xl">
          <p className="text-[0.72rem] uppercase tracking-[0.3em] text-[#C8A24B]">La Masonería</p>
          <h2 className="font-display mt-4 text-3xl font-semibold sm:text-4xl">¿Qué es la masonería?</h2>
          <hr className="rule-gold mt-5" />
          <p className="mt-8 leading-relaxed text-[#ECE7DA]/72">
            La masonería es una institución filosófica, filantrópica y progresista. Promueve la reflexión, la
            investigación racional de las leyes naturales y el perfeccionamiento moral e intelectual de las personas.
          </p>
          <p className="mt-5 leading-relaxed text-[#ECE7DA]/72">
            No es una religión ni un partido, ni un club de negocios. Es una escuela de pensamiento libre que, mediante
            símbolos y el trabajo sobre uno mismo, busca el progreso de cada hombre y, a través de él, el de la
            humanidad.
          </p>
          <p className="font-display mt-6 text-xl italic text-[#C8A24B]">Su lema es «Ciencia, Justicia, Trabajo».</p>
        </div>
      </section>

      {/* Cómo Acercarse */}
      <section id="camino" className="border-t border-[#C8A24B]/12 px-7 py-24">
        <div className="mx-auto max-w-3xl">
          <p className="text-[0.72rem] uppercase tracking-[0.3em] text-[#C8A24B]">Cómo Acercarse</p>
          <h2 className="font-display mt-4 text-3xl font-semibold sm:text-4xl">El primer paso es una conversación</h2>
          <hr className="rule-gold mt-5" />
          <p className="mt-8 leading-relaxed text-[#ECE7DA]/72">
            El ingreso a la masonería no se solicita como quien llena un formulario; comienza con un encuentro. Si es
            usted un hombre de buena voluntad y siente el llamado, escríbanos. Toda consulta se recibe con discreción y
            será respondida personalmente.
          </p>
          <div className="mt-12 grid gap-10 sm:grid-cols-3">
            {[
              { n: 'I', h: 'Escríbanos', p: 'Deje sus datos y unas líneas. Nada lo compromete.' },
              { n: 'II', h: 'Conversamos', p: 'Un hermano se comunicará con usted, en privado y sin apuro.' },
              { n: 'III', h: 'El camino', p: 'Si hay afinidad mutua, conocerá los pasos que siguen.' },
            ].map((s) => (
              <div key={s.n}>
                <div className="font-display text-2xl text-[#C8A24B]">{s.n}</div>
                <h3 className="font-display mt-3 text-xl font-semibold">{s.h}</h3>
                <p className="mt-2 text-[#ECE7DA]/72">{s.p}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-[#C8A24B]/15 bg-[#060607] px-7 py-16 text-center">
        <div className="mx-auto flex max-w-3xl flex-col items-center">
          <SquareCompass className="h-10 w-10 text-[#C8A24B]" />
          <div className="font-display mt-5 text-2xl font-semibold tracking-wide">
            Respetable Logia Simón Bolívar Nº 646
          </div>
          <div className="mt-3 text-[0.72rem] uppercase leading-7 tracking-[0.14em] text-[#ECE7DA]/55">
            Oriente de Buenos Aires
            <br />
            Bajo la obediencia de la Gran Logia de la Argentina
          </div>
          <div className="font-display mt-4 text-lg italic text-[#C8A24B]">«Ciencia, Justicia, Trabajo»</div>
          <div className="mt-7 text-[0.7rem] tracking-[0.08em] text-[#ECE7DA]/45">
            © 2026 R∴L∴ Simón Bolívar Nº 646
          </div>
        </div>
      </footer>
    </div>
  );
}
