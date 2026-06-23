/**
 * @file useAsistenteTour.ts
 * @description React runner for the asistente guided spotlight (Phase 2 Slice 1).
 *
 *   Given a task's TourStep[], it steps through them with driver.js while honoring
 *   the app's route guards. For each step it:
 *     1. navigates with react-router if the step route differs from the current path,
 *     2. awaits waitForSettled (a 2000 ms budget that tolerates the loader phase
 *        and resolves on the first off-route pathname if a guard redirects us),
 *     3. classifies the result, then:
 *          'role-gated-stop' -> show the task ACCESS NOTE in a no-spotlight popover and END,
 *          'text-continue'   -> show the step text in a no-spotlight popover, then continue,
 *          'spotlight'       -> highlight the [data-asistente] element with a Spanish popover.
 *
 *   Hand-on-the-wheel: the runner NEVER calls .click(), .submit(), or sets values.
 *   It only highlights, captions, and navigates to the screen. The user does the work.
 *
 *   Exit paths (ESC, the Cerrar button, clicking the overlay) all end cleanly:
 *   destroy the driver instance, release the scroll lock driver.js applies to
 *   <html>, and return focus to the element that launched the tour.
 *
 *   Motion: under prefers-reduced-motion we pass animate:false to driver.js.
 */

import { useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { driver, type Driver } from 'driver.js';
import 'driver.js/dist/driver.css';

import {
  type TourStep,
  classifyStep,
  waitForSettled,
  buildStepPlan,
} from '@/lib/asistenteTour';

/** Spanish button labels for the popover, fixed across the tour. */
const BTN_NEXT = 'Siguiente';
const BTN_PREV = 'Anterior';
const BTN_CLOSE = 'Cerrar';

/** Role-gated stop copy, shown when a guard redirects us off a step route. */
const ROLE_GATED_TITLE = 'No tenés acceso a esta pantalla';
const ROLE_GATED_FALLBACK_BODY =
  'Esta acción requiere un acceso que tu usuario no tiene en este momento.';

/** The static labels handed to buildStepPlan; fixed across the tour. */
const STEP_PLAN_LABELS = {
  next: BTN_NEXT,
  prev: BTN_PREV,
  close: BTN_CLOSE,
  roleGatedTitle: ROLE_GATED_TITLE,
  roleGatedFallbackBody: ROLE_GATED_FALLBACK_BODY,
} as const;

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export type StartTourOptions = {
  /** The ordered steps to run. */
  steps: TourStep[];
  /**
   * The shared access note shown if a guard redirects us off a step route
   * (KbTask.note / ACCESO_DINERO). Optional; if absent a neutral message is used.
   */
  accessNote?: string;
  /**
   * The element that launched the tour. Focus returns here when the tour ends so
   * keyboard users are not stranded.
   */
  returnFocusTo?: HTMLElement | null;
};

export type AsistenteTourController = {
  /** Start (or restart) the tour from step 0. */
  start: (opts: StartTourOptions) => void;
  /** Stop the tour and clean up, if running. */
  stop: () => void;
};

/**
 * The runner hook. Returns a stable controller. The launching component decides
 * which task's steps to pass and provides the trigger element for focus return.
 */
export function useAsistenteTour(): AsistenteTourController {
  const navigate = useNavigate();
  const driverRef = useRef<Driver | null>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  // A monotonically increasing run id; an exit bumps it so an in-flight async
  // step loop from a previous run stops touching driver.js after cleanup.
  const runIdRef = useRef(0);

  const cleanup = useCallback(() => {
    runIdRef.current += 1;
    const d = driverRef.current;
    driverRef.current = null;
    if (d && d.isActive()) {
      d.destroy();
    }
    // driver.js adds 'driver-active'/'driver-fade' to <body> for its overlay and
    // transitions; destroy() removes them, but we strip them defensively from the
    // body in case we tore down mid-transition before driver could.
    if (typeof document !== 'undefined') {
      document.body.classList.remove('driver-active', 'driver-fade');
    }
    const el = returnFocusRef.current;
    returnFocusRef.current = null;
    // Return focus to the launcher so keyboard users are not stranded. But a tour
    // often navigates to another screen, which unmounts the chat trigger that
    // launched it; focusing a detached node is a no-op and focus falls to <body>.
    // So: focus the stored trigger only if it is still connected to the document;
    // otherwise fall back to the floating assistant FAB if it is present; if
    // neither exists, leave focus where it is rather than crash.
    const hasDoc = typeof document !== 'undefined';
    if (el && typeof el.focus === 'function' && (!hasDoc || document.contains(el))) {
      el.focus();
    } else if (hasDoc) {
      const fab = document.querySelector<HTMLElement>(
        'button[aria-label^="Abrir el asistente"]',
      );
      if (fab && typeof fab.focus === 'function') {
        fab.focus();
      }
    }
  }, []);

  const start = useCallback(
    (opts: StartTourOptions) => {
      const { steps, accessNote, returnFocusTo } = opts;
      if (!steps || steps.length === 0) return;

      // Tear down any previous run first.
      if (driverRef.current) {
        const prev = driverRef.current;
        driverRef.current = null;
        if (prev.isActive()) prev.destroy();
      }
      returnFocusRef.current = returnFocusTo ?? null;

      const reduced = prefersReducedMotion();
      const d = driver({
        animate: !reduced,
        allowClose: true,
        // ESC and the close button both end the tour; clicking the overlay also
        // closes it. We never advance on overlay click (that would feel like the
        // tour is doing the work).
        overlayClickBehavior: 'close',
        allowKeyboardControl: true,
        showProgress: false,
        nextBtnText: BTN_NEXT,
        prevBtnText: BTN_PREV,
        doneBtnText: BTN_CLOSE,
        // A single cleanup path for every exit: ESC, the close button, the
        // overlay click, or the final Done all funnel through onDestroyed.
        onDestroyed: () => {
          // Only run our cleanup once; cleanup() nulls the ref so a re-entrant
          // destroy is a no-op.
          if (driverRef.current === d || driverRef.current === null) {
            cleanup();
          }
        },
      });
      driverRef.current = d;

      const myRun = runIdRef.current;
      const isStale = () => runIdRef.current !== myRun || driverRef.current !== d;

      // Drive one step at a time. We control navigation and the settle wait
      // ourselves, then hand driver.js a single highlight per step. The popover
      // Next/Prev buttons advance our own index; they never click app controls.
      const runStep = async (index: number) => {
        if (isStale()) return;
        if (index < 0 || index >= steps.length) {
          cleanup();
          return;
        }

        const step = steps[index];

        // Navigate only if we are not already on the step route.
        if (step.route && window.location.pathname !== step.route) {
          navigate(step.route);
        }

        const { settledPathname, elementPresent } = await waitForSettled({
          stepRoute: step.route,
          anchor: step.anchor,
        });
        if (isStale()) return;

        // An info-only step (no anchor) is always "present" for classification:
        // there is nothing to wait for, only a caption to show.
        const effectivePresent = step.anchor ? elementPresent : true;
        const resolution = classifyStep(settledPathname, step.route, effectivePresent);

        const isFirst = index === 0;
        const isLast = index === steps.length - 1;

        // The pure core decides the static popover config (text, which buttons,
        // button labels, and whether there is an element to spotlight). The click
        // handlers stay here because they touch React/router/driver state.
        const plan = buildStepPlan({
          resolution,
          step,
          isFirst,
          isLast,
          accessNote,
          labels: STEP_PLAN_LABELS,
        });

        if (plan.kind === 'role-gated-stop') {
          // A guard redirected us. Show the access note with NO spotlight and end.
          d.highlight({
            popover: {
              ...plan.popover,
              onCloseClick: () => cleanup(),
            },
          });
          return;
        }

        // Next/Prev move OUR index. They never touch app controls. On the last
        // step, Next ends the tour. (The last step's Next is already relabeled to
        // Cerrar by buildStepPlan; the handler ends the tour rather than advancing.)
        const navHandlers = {
          onNextClick: () => {
            if (isLast) {
              cleanup();
            } else {
              void runStep(index + 1);
            }
          },
          onPrevClick: () => {
            void runStep(index - 1);
          },
          onCloseClick: () => cleanup(),
        };

        if (plan.kind === 'spotlight') {
          d.highlight({
            element: plan.element,
            popover: { ...plan.popover, ...navHandlers },
          });
        } else {
          // text-continue: on the right route but the control is absent. Show the
          // caption with no spotlight so the tour never points at nothing.
          d.highlight({ popover: { ...plan.popover, ...navHandlers } });
        }
      };

      void runStep(0);
    },
    [navigate, cleanup],
  );

  const stop = useCallback(() => {
    cleanup();
  }, [cleanup]);

  // Safety net: if the launching component unmounts mid-tour, tear down.
  useEffect(() => {
    return () => {
      const d = driverRef.current;
      driverRef.current = null;
      if (d && d.isActive()) d.destroy();
      if (typeof document !== 'undefined') {
        document.body.classList.remove('driver-active', 'driver-fade');
      }
    };
  }, []);

  return { start, stop };
}
