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

import { useState, type ChangeEvent, type FormEvent } from 'react';
import { SecretDoor } from '@/components/lodge/SecretDoor';
import { MountainRidge, SquareCompass } from '@/components/lodge/LodgeMarks';
import { useParallax } from '@/hooks/useParallax';

export default function Landing() {
  // Subtle scroll parallax on the Andean ridge (static under reduced motion).
  const ridgeRef = useParallax<HTMLDivElement>({ speed: 0.2 });

  return (
    <div className="min-h-screen bg-[#0B0B0D] font-sans text-[#ECE7DA]">
      {/* Header (no members button; the way in is the sun) */}
      <header className="sticky top-0 z-40 border-b border-[#C8A24B]/15 bg-[#0B0B0D]/80 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-7 py-4">
          <div className="font-display text-lg font-semibold tracking-wide">Logia Simón Bolívar Nº 646</div>
          <nav className="hidden gap-6 text-[0.7rem] uppercase tracking-[0.14em] text-[#ECE7DA]/70 lg:flex">
            <a className="transition-colors hover:text-[#C8A24B]" href="#logia">Nuestra Logia</a>
            <a className="transition-colors hover:text-[#C8A24B]" href="#masoneria">La Masonería</a>
            <a className="transition-colors hover:text-[#C8A24B]" href="#paraustedes">¿Es para usted?</a>
            <a className="transition-colors hover:text-[#C8A24B]" href="#camino">Cómo Acercarse</a>
            <a className="transition-colors hover:text-[#C8A24B]" href="#preguntas">Preguntas</a>
            <a className="transition-colors hover:text-[#C8A24B]" href="#contacto">Contacto</a>
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
        <div
          ref={ridgeRef}
          className="pointer-events-none absolute bottom-0 left-0 z-0 h-[34vh] w-full will-change-transform"
        >
          <MountainRidge className="h-full w-full" />
        </div>
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

      {/* ¿Es para usted? */}
      <section id="paraustedes" className="border-t border-[#C8A24B]/12 bg-gradient-to-b from-[#0e0e11] to-[#0B0B0D] px-7 py-24">
        <div className="mx-auto max-w-4xl">
          <p className="text-[0.72rem] uppercase tracking-[0.3em] text-[#C8A24B]">¿Es para usted?</p>
          <h2 className="font-display mt-4 text-3xl font-semibold sm:text-4xl">¿Es la masonería para usted?</h2>
          <hr className="rule-gold mt-5" />
          <p className="mt-8 max-w-3xl text-lg leading-relaxed text-[#ECE7DA]/90">
            No hay un único tipo de masón. Suelen acercarse hombres curiosos, de buena voluntad, dispuestos a
            examinarse a sí mismos y a respetar a quienes piensan distinto.
          </p>
          <div className="mt-12 grid gap-10 sm:grid-cols-2">
            <div>
              <h3 className="font-display text-xl font-semibold">Para acercarse</h3>
              <ul className="mt-5 space-y-3.5">
                {[
                  'Ser hombre, mayor de edad, de vida honorable.',
                  'Profesar fe en un Principio Creador (el Gran Arquitecto del Universo), cualquiera sea su religión.',
                  'Tener voluntad de mejorar y de trabajar junto a otros.',
                  'Saber guardar discreción y respetar la palabra dada.',
                ].map((t) => (
                  <li
                    key={t}
                    className="relative pl-6 leading-relaxed text-[#ECE7DA]/72 before:absolute before:left-0 before:top-[0.55em] before:h-2 before:w-2 before:rotate-45 before:border before:border-[#C8A24B]/45"
                  >
                    {t}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="font-display text-xl font-semibold">Lo que la masonería no es</h3>
              <ul className="mt-5 space-y-3.5">
                {[
                  'No es una religión ni reemplaza a ninguna.',
                  'No es un partido político.',
                  'No es una red de negocios ni de influencias.',
                  'No se paga por pertenecer y no hacemos proselitismo.',
                ].map((t) => (
                  <li
                    key={t}
                    className="relative pl-6 leading-relaxed text-[#ECE7DA]/72 before:absolute before:left-0 before:top-[0.62em] before:h-px before:w-3 before:bg-[#C8A24B]/45"
                  >
                    {t}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Tradición / Hermanos Ilustres */}
      <section id="hermanos" className="border-t border-[#C8A24B]/12 px-7 py-24">
        <div className="mx-auto max-w-4xl">
          <p className="text-[0.72rem] uppercase tracking-[0.3em] text-[#C8A24B]">Tradición</p>
          <h2 className="font-display mt-4 text-3xl font-semibold sm:text-4xl">Una tradición que dio forma a la Patria</h2>
          <hr className="rule-gold mt-5" />
          <p className="mt-8 max-w-3xl leading-relaxed text-[#ECE7DA]/72">
            La masonería argentina cuenta entre sus filas a hombres que ayudaron a fundar la Nación. No los reclamamos
            como propios; honramos la tradición de ideales que compartimos con ellos.
          </p>
          <div className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { name: 'José de San Martín', dates: '1778 · 1850', role: 'Libertador de América.' },
              { name: 'Manuel Belgrano', dates: '1770 · 1820', role: 'Creador de la Bandera.' },
              { name: 'Vicente López y Planes', dates: '1785 · 1856', role: 'Autor del Himno Nacional.' },
              { name: 'Domingo F. Sarmiento', dates: '1811 · 1888', role: 'Maestro y Presidente.' },
            ].map((f) => (
              <div key={f.name} className="border-t border-[#C8A24B]/15 pt-5">
                <h3 className="font-display text-xl font-semibold leading-tight">{f.name}</h3>
                <div className="mt-2 text-[0.66rem] uppercase tracking-[0.16em] text-[#ECE7DA]/55">{f.dates}</div>
                <p className="mt-2 italic text-[#ECE7DA]/72">{f.role}</p>
              </div>
            ))}
          </div>
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

      {/* Preguntas Frecuentes */}
      <section id="preguntas" className="border-t border-[#C8A24B]/12 bg-gradient-to-b from-[#0e0e11] to-[#0B0B0D] px-7 py-24">
        <div className="mx-auto max-w-3xl">
          <p className="text-[0.72rem] uppercase tracking-[0.3em] text-[#C8A24B]">Preguntas Frecuentes</p>
          <h2 className="font-display mt-4 text-3xl font-semibold sm:text-4xl">Dudas habituales antes de acercarse</h2>
          <hr className="rule-gold mt-5" />
          <div className="mt-10 border-t border-[#C8A24B]/12">
            {[
              { q: '¿Cómo se hace uno masón en la Argentina?', a: 'No existe una solicitud formal ni un examen de ingreso público. El camino para ser masón comienza cuando un hombre se acerca, por iniciativa propia, a una logia regular y manifiesta su inquietud. A partir de allí hay conversaciones, conocimiento mutuo y, si hay afinidad, una invitación a iniciar el camino.' },
              { q: '¿Cuáles son los requisitos para ingresar?', a: 'Ser hombre, mayor de edad, de conducta honorable, con voluntad de superarse y de trabajar con otros. La masonería regular pide además profesar fe en un Principio Creador, el Gran Arquitecto del Universo, sin distinción de religión. No se exige formación ni posición social alguna.' },
              { q: '¿Hay que tener una religión?', a: 'No se pide pertenecer a una religión determinada. Sí se pide creer en un Principio Creador. La masonería respeta todas las creencias y no discute asuntos religiosos en sus trabajos; cada hermano conserva su fe en libertad.' },
              { q: '¿Cuánto cuesta pertenecer?', a: 'No se paga por ingresar. Existe una cuota regular que sostiene el funcionamiento de la logia y sus obras de beneficencia, modesta y conocida de antemano. La masonería no es un negocio ni busca lucro.' },
              { q: '¿Pueden ingresar mujeres?', a: 'Esta logia trabaja bajo la Gran Logia de la Argentina, de tradición masculina. Existen en el país otras obediencias femeninas y mixtas. Con gusto orientamos a quien lo consulte hacia el camino que corresponda.' },
              { q: '¿La masonería es una sociedad secreta?', a: 'No. La masonería es una institución discreta, no secreta. Sus principios, su historia y su existencia son públicos; lo reservado es la intimidad de sus trabajos y la identidad de quienes la integran, por respeto a cada hermano.' },
              { q: '¿Dónde se reúne la Logia?', a: 'Nos reunimos en la Ciudad de Buenos Aires. Por discreción, el lugar y los horarios se comparten en privado con quienes inician una conversación con nosotros.' },
              { q: '¿Qué pasa después de que escribo?', a: 'Un hermano le responderá en privado, sin apuro y sin compromiso. Si ambos lo desean, habrá un encuentro para conocerse. Usted decide en cada paso si continúa.' },
            ].map((item) => (
              <details key={item.q} className="group border-b border-[#C8A24B]/12">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-5 font-display text-xl font-semibold text-[#ECE7DA] transition-colors hover:text-[#C8A24B] [&::-webkit-details-marker]:hidden">
                  {item.q}
                  <span className="text-2xl font-light leading-none text-[#C8A24B] transition-transform duration-200 group-open:rotate-45">+</span>
                </summary>
                <p className="pb-6 leading-relaxed text-[#ECE7DA]/72">{item.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* Contacto */}
      <section id="contacto" className="border-t border-[#C8A24B]/12 px-7 py-24">
        <div className="mx-auto max-w-4xl">
          <p className="text-[0.72rem] uppercase tracking-[0.3em] text-[#C8A24B]">Contacto</p>
          <h2 className="font-display mt-4 text-3xl font-semibold sm:text-4xl">Escríbanos en confianza</h2>
          <hr className="rule-gold mt-5" />
          <div className="mt-12 grid gap-10 lg:grid-cols-[0.85fr_1.15fr]">
            <div>
              <p className="leading-relaxed text-[#C8A24B]">
                Sus datos se tratan con absoluta reserva y no se comparten con nadie.
              </p>
              <ul className="mt-6 space-y-3.5">
                {[
                  'Su mensaje lo recibe un hermano, en privado.',
                  'Le responderemos personalmente, sin apuro.',
                  'Ninguna obligación; usted decide si continúa.',
                ].map((t) => (
                  <li
                    key={t}
                    className="relative pl-6 text-sm leading-relaxed text-[#ECE7DA]/72 before:absolute before:left-0 before:top-[0.5em] before:h-2 before:w-2 before:rotate-45 before:border before:border-[#C8A24B]/45"
                  >
                    {t}
                  </li>
                ))}
              </ul>
            </div>
            <ContactForm />
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

/**
 * ContactForm - the public, discreet contact path. Client-side validation in
 * formal Spanish with an on-brand success state. Wiring it to a real monitored
 * inbox (a Supabase "inquiries" table) is a follow-up: the SQL is provided
 * separately and run in the Supabase dashboard.
 */
function ContactForm() {
  const [values, setValues] = useState({ nombre: '', email: '', tel: '', msg: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [sent, setSent] = useState(false);

  const update =
    (key: keyof typeof values) =>
    (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setValues((v) => ({ ...v, [key]: e.target.value }));
      setErrors((er) => (er[key] ? { ...er, [key]: '' } : er));
    };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (!values.nombre.trim()) next.nombre = 'Indíquenos su nombre y apellido, por favor.';
    if (!values.email.trim()) next.email = 'Necesitamos un correo electrónico para responderle.';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)) next.email = 'Revise el correo electrónico; parece incompleto.';
    if (!values.msg.trim()) next.msg = 'Escríbanos unas líneas para conocer el motivo de su consulta.';
    setErrors(next);
    if (Object.keys(next).length === 0) {
      // TODO: insert into a Supabase "inquiries" table once it exists.
      setSent(true);
    }
  };

  const fieldBase =
    'w-full rounded border bg-white/[0.03] px-4 py-3 text-[#ECE7DA] placeholder:text-[#ECE7DA]/30 transition-colors focus:outline-none';
  const ok = 'border-[#ECE7DA]/25 focus:border-[#C8A24B]';
  const bad = 'border-[#E2C173]';
  const labelCls = 'mb-2 block text-[0.7rem] uppercase tracking-[0.14em] text-[#ECE7DA]/55';

  if (sent) {
    return (
      <div className="rounded border border-[#C8A24B]/20 bg-[#161518] p-10 text-center">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full border border-[#C8A24B]/45 text-2xl text-[#C8A24B]">
          ✦
        </div>
        <h3 className="font-display text-2xl font-semibold">Gracias por escribirnos.</h3>
        <p className="mt-3 text-[#ECE7DA]/72">
          Hemos recibido su mensaje. Un hermano le responderá en privado, a la brevedad, con la reserva que esta casa
          acostumbra.
        </p>
      </div>
    );
  }

  return (
    <form noValidate onSubmit={onSubmit} className="rounded border border-[#C8A24B]/15 bg-[#161518] p-7">
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="l-nombre" className={labelCls}>Nombre y Apellido</label>
          <input
            id="l-nombre"
            type="text"
            autoComplete="name"
            value={values.nombre}
            onChange={update('nombre')}
            aria-invalid={!!errors.nombre}
            className={`${fieldBase} ${errors.nombre ? bad : ok}`}
          />
          {errors.nombre && <p className="mt-2 text-xs text-[#E2C173]">{errors.nombre}</p>}
        </div>
        <div>
          <label htmlFor="l-email" className={labelCls}>Correo electrónico</label>
          <input
            id="l-email"
            type="email"
            autoComplete="email"
            value={values.email}
            onChange={update('email')}
            aria-invalid={!!errors.email}
            className={`${fieldBase} ${errors.email ? bad : ok}`}
          />
          {errors.email && <p className="mt-2 text-xs text-[#E2C173]">{errors.email}</p>}
        </div>
      </div>
      <div className="mt-5">
        <label htmlFor="l-tel" className={labelCls}>
          Teléfono <span className="lowercase tracking-normal text-[#ECE7DA]/40">(opcional)</span>
        </label>
        <input
          id="l-tel"
          type="tel"
          autoComplete="tel"
          value={values.tel}
          onChange={update('tel')}
          className={`${fieldBase} ${ok}`}
        />
      </div>
      <div className="mt-5">
        <label htmlFor="l-msg" className={labelCls}>Mensaje</label>
        <textarea
          id="l-msg"
          rows={5}
          value={values.msg}
          onChange={update('msg')}
          aria-invalid={!!errors.msg}
          className={`${fieldBase} ${errors.msg ? bad : ok} resize-y`}
        />
        {errors.msg && <p className="mt-2 text-xs text-[#E2C173]">{errors.msg}</p>}
      </div>
      <button
        type="submit"
        className="mt-6 w-full rounded bg-[#C8A24B] px-6 py-4 text-[0.82rem] font-semibold uppercase tracking-[0.16em] text-[#0B0B0D] transition-colors hover:bg-[#E2C173]"
      >
        Enviar mensaje
      </button>
    </form>
  );
}
