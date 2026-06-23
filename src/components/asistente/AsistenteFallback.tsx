/**
 * @file AsistenteFallback.tsx
 * @description Guía rápida estática y sin red para el asistente de tesorería.
 *
 *   Slice 4: degradación elegante. Cuando el asistente no esta disponible (sin
 *   conexión, límite mensual alcanzado, o la función todavía no esta
 *   desplegada), mostramos esta guía en lugar de un callejón sin salida. Tambien
 *   es accesible siempre desde el estado vacío del chat con "Ver guía rápida".
 *
 *   No hace ninguna llamada de red. Todo el contenido se renderiza desde
 *   src/lib/asistenteKb.ts (ASISTENTE_TASKS y ASISTENTE_GLOSSARY); no se duplica
 *   copia. Estilo Direction 3 (calmo, dorado), mobile-first y accesible.
 */

import { ListChecks, Map, BookOpen } from 'lucide-react';

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { cn } from '@/lib/utils';
import {
  ASISTENTE_TASKS,
  ASISTENTE_GLOSSARY,
  type KbTaskId,
} from '@/lib/asistenteKb';

/**
 * Un paso de la lista "Primeros pasos": las tareas centrales de la primera
 * sesión de un tesorero nuevo. `taskId` apunta a una tarea de ASISTENTE_TASKS
 * cuando corresponde, asi la ficha de la cheat sheet queda referenciada sin
 * duplicar sus pasos. La copia se mantiene corta y en español rioplatense.
 */
interface FirstStep {
  title: string;
  taskId?: KbTaskId;
}

const FIRST_STEPS: FirstStep[] = [
  { title: 'Revisá en Inicio quiénes deben cápita este mes.' },
  { title: 'Registrá un pago de cápita.', taskId: 'T1' },
  { title: 'Revisá y enviá los recordatorios por WhatsApp.', taskId: 'T6' },
  { title: 'Hacé la transferencia a la Gran Logia.', taskId: 'T3' },
  { title: 'Generá el reporte mensual cuando cierres el mes.', taskId: 'T4' },
];

/** Mapa rápido de id de tarea a su título, para etiquetar los "Primeros pasos". */
const TASK_TITLE_BY_ID: Record<string, string> = Object.fromEntries(
  ASISTENTE_TASKS.map((t) => [t.id, t.title]),
);

interface AsistenteFallbackProps {
  className?: string;
}

/**
 * Guía rápida estática. Pensada para vivir dentro del scroll del chat, por eso
 * no controla su propio overflow: el contenedor padre maneja el desplazamiento.
 */
export function AsistenteFallback({ className }: AsistenteFallbackProps) {
  return (
    <div className={cn('space-y-6', className)}>
      <header className="space-y-1">
        <h2 className="section-title text-sm font-semibold text-foreground">
          Guía rápida
        </h2>
        <p className="text-xs leading-relaxed text-muted-foreground">
          Cómo hacer las cosas en la app, sin conexión. No consulta ni informa
          saldos ni datos de miembros.
        </p>
      </header>

      {/* Primeros pasos */}
      <section aria-labelledby="asistente-primeros-pasos" className="space-y-3">
        <div className="flex items-center gap-2">
          <ListChecks className="h-4 w-4 text-primary" aria-hidden="true" />
          <h3
            id="asistente-primeros-pasos"
            className="text-sm font-semibold text-foreground"
          >
            Primeros pasos
          </h3>
        </div>
        <ol className="space-y-2">
          {FIRST_STEPS.map((step, i) => (
            <li
              key={i}
              className="flex items-start gap-2.5 rounded-lg border border-border/60 bg-card px-3 py-2.5"
            >
              <span
                className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary"
                aria-hidden="true"
              >
                {i + 1}
              </span>
              <div className="space-y-0.5">
                <p className="text-sm leading-snug text-foreground">
                  {step.title}
                </p>
                {step.taskId && (
                  <p className="text-xs text-muted-foreground">
                    Ver el paso a paso en{' '}
                    <span className="font-medium text-foreground">
                      {TASK_TITLE_BY_ID[step.taskId]}
                    </span>{' '}
                    abajo.
                  </p>
                )}
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* Cheat sheet: las ocho tareas */}
      <section aria-labelledby="asistente-tareas" className="space-y-3">
        <div className="flex items-center gap-2">
          <Map className="h-4 w-4 text-primary" aria-hidden="true" />
          <h3
            id="asistente-tareas"
            className="text-sm font-semibold text-foreground"
          >
            Las tareas paso a paso
          </h3>
        </div>
        <Accordion
          type="multiple"
          className="overflow-hidden rounded-lg border border-border/60 bg-card"
        >
          {ASISTENTE_TASKS.map((task) => (
            <AccordionItem
              key={task.id}
              value={task.id}
              className="border-b border-border/60 px-3 last:border-b-0"
            >
              <AccordionTrigger className="py-3 text-left text-sm font-medium text-foreground hover:no-underline">
                {task.title}
              </AccordionTrigger>
              <AccordionContent className="pb-3 pt-0">
                <div className="space-y-3">
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    <span className="font-medium text-foreground">
                      {task.screen}
                    </span>{' '}
                    <span className="font-mono text-[11px]">({task.route})</span>
                  </p>
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    {task.nav}
                  </p>
                  {task.note && (
                    <p className="rounded-md bg-accent/40 px-2.5 py-1.5 text-xs leading-relaxed text-muted-foreground">
                      {task.note}
                    </p>
                  )}
                  <ol className="space-y-1.5">
                    {task.steps.map((step, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs">
                        <span
                          className="mt-px font-semibold text-primary"
                          aria-hidden="true"
                        >
                          {i + 1}.
                        </span>
                        <span className="leading-relaxed text-foreground">
                          {step}
                        </span>
                      </li>
                    ))}
                  </ol>
                </div>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </section>

      {/* Glosario */}
      <section aria-labelledby="asistente-glosario" className="space-y-3">
        <div className="flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-primary" aria-hidden="true" />
          <h3
            id="asistente-glosario"
            className="text-sm font-semibold text-foreground"
          >
            Glosario
          </h3>
        </div>
        <dl className="space-y-2 rounded-lg border border-border/60 bg-card px-3 py-3">
          {Object.entries(ASISTENTE_GLOSSARY).map(([term, definition]) => (
            <div key={term} className="text-xs leading-relaxed">
              <dt className="inline font-semibold text-foreground">{term}: </dt>
              <dd className="inline text-muted-foreground">{definition}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}
