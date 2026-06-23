/**
 * @file asistenteTour.ts
 * @description Deterministic, KB-driven guided spotlight core for the asistente.
 *
 *   Phase 2 Slice 1 (risk spike). This module holds the PURE, framework-free
 *   parts of the guided tour so they can be unit tested without a DOM or React:
 *   the step types, the step classifier, and the post-navigation "settled" wait.
 *   The React runner that wires these to driver.js and react-router lives in
 *   useAsistenteTour.ts and imports from here.
 *
 *   Hand-on-the-wheel contract: the tour ONLY highlights, captions, and
 *   navigates to the screen. It NEVER clicks, fills, submits, or moves money. The
 *   classifier and the wait are read-only observations of the DOM and the URL.
 *
 *   Why a custom classifier instead of leaning on driver.js navigation: a money
 *   task like T1 lives behind an AdminRoute guard. A non-admin who reaches
 *   /log-payment is redirected by the guard ('/' then RootGate to '/home', a
 *   two-hop redirect), and there is a brief loader phase while roles resolve. The
 *   tour must detect "a guard sent us somewhere else" and stop gracefully with
 *   the access note, rather than spotlighting an element that will never appear.
 *   classifyStep + waitForSettled make that decision deterministic.
 */

/** One step of a guided tour. */
export type TourStep = {
  /**
   * The REAL, non-aliased route this step lives on (for example '/log-payment').
   * It must be the route the app actually settles on, never an alias that
   * redirects, so the settled-pathname comparison is meaningful.
   */
  route?: string;
  /**
   * The data-asistente id of the control to spotlight. Omit for an info-only
   * step (shown as a popover with no spotlight).
   */
  anchor?: string;
  /** Short Spanish caption title. */
  title: string;
  /** Short Spanish caption body. */
  body: string;
};

/**
 * How a step resolves once navigation has settled:
 *   - 'spotlight'        highlight the anchored element with a popover.
 *   - 'text-continue'    we are on the right route but the element is absent
 *                        (still loading, or conditionally hidden): show the
 *                        step text in a popover with no spotlight, then continue.
 *   - 'role-gated-stop'  a guard redirected us away from the step route: show
 *                        the access note and end the tour gracefully.
 */
export type StepResolution = 'spotlight' | 'text-continue' | 'role-gated-stop';

/**
 * Decide how a step resolves from three observed facts. Pure: no DOM, no router,
 * no side effects, so it is fully unit testable.
 *
 *   @param settledPathname  the pathname after navigation settled (window.location.pathname).
 *   @param stepRoute        the step's REAL route, or undefined for an info-only step with no route.
 *   @param elementPresent   whether the step's anchor element is in the DOM.
 *
 * Rule, in order:
 *   1. If the step declares a route and we did NOT settle on it, a guard moved us
 *      away. Return 'role-gated-stop'. Because we always compare against the REAL
 *      step route, this one rule covers the two-hop /->/home admin redirect and
 *      any alias mismatch uniformly.
 *   2. Else if the element is absent, return 'text-continue' (the route is right,
 *      the anchored control just is not rendered). The runner passes
 *      elementPresent=true for an info-only step (no anchor), so an info step
 *      skips this branch and spotlights its caption.
 *   3. Else 'spotlight' (on route with the element present, or an info-only step).
 */
export function classifyStep(
  settledPathname: string,
  stepRoute: string | undefined,
  elementPresent: boolean,
): StepResolution {
  if (stepRoute && settledPathname !== stepRoute) {
    return 'role-gated-stop';
  }
  if (!elementPresent) {
    return 'text-continue';
  }
  return 'spotlight';
}

/** The CSS selector for a step anchor, kept in one place. */
export function anchorSelector(anchor: string): string {
  return `[data-asistente="${anchor}"]`;
}

/** Which driver.js footer buttons a step shows. */
export type StepButton = 'next' | 'previous' | 'close';

/** The Spanish labels and role-gated copy the runner feeds buildStepPlan. */
export type StepPlanLabels = {
  /** Next button label (Spanish). */
  next: string;
  /** Previous button label (Spanish). */
  prev: string;
  /** Close / Done button label (Spanish). */
  close: string;
  /** Title shown when a guard redirected us off the step route. */
  roleGatedTitle: string;
  /** Neutral body used when no access note was provided for a role-gated stop. */
  roleGatedFallbackBody: string;
};

/**
 * A plain, framework-free description of the popover a single step should show.
 * The runner turns this into a driver.js highlight call. It carries ONLY static
 * config (text, which buttons, button labels); the click handlers stay in the
 * runner because they touch React/router/driver state.
 *
 *   - 'role-gated-stop' a guard moved us off the step route: show the access note
 *                       (or a neutral fallback) with only a Close button. No
 *                       element. The runner ends the tour after showing this.
 *   - 'text-continue'   on the right route but the anchored control is absent:
 *                       show the caption with no spotlight and the nav buttons.
 *   - 'spotlight'       highlight the anchored element with the caption and nav.
 */
export type StepPlan =
  | {
      kind: 'role-gated-stop';
      element?: undefined;
      popover: {
        title: string;
        description: string;
        showButtons: StepButton[];
        doneBtnText: string;
      };
    }
  | {
      kind: 'text-continue';
      element?: undefined;
      popover: {
        title: string;
        description: string;
        showButtons: StepButton[];
        nextBtnText: string;
        prevBtnText: string;
        doneBtnText: string;
      };
    }
  | {
      kind: 'spotlight';
      element: string;
      popover: {
        title: string;
        description: string;
        showButtons: StepButton[];
        nextBtnText: string;
        prevBtnText: string;
        doneBtnText: string;
      };
    };

export type BuildStepPlanParams = {
  /** How the step resolved once navigation settled. */
  resolution: StepResolution;
  /** The step being shown. */
  step: TourStep;
  /** Whether this is the first step (hides the Previous button). */
  isFirst: boolean;
  /** Whether this is the last step (Next is relabeled to the Close label). */
  isLast: boolean;
  /** The shared access note for a role-gated stop; a neutral fallback is used if absent. */
  accessNote?: string;
  /** Spanish button labels and role-gated copy. */
  labels: StepPlanLabels;
};

/**
 * Build the static popover descriptor for one step. Pure: no DOM, no driver.js,
 * no React, so the per-step decision is fully unit testable. It encodes exactly
 * the rules the runner used inline:
 *
 *   - role-gated-stop: role-gated title + the access note (or neutral fallback),
 *     only a Close button.
 *   - text-continue:   step title/body, no element, nav buttons.
 *   - spotlight:       step title/body, element = anchorSelector(step.anchor),
 *     nav buttons.
 *
 * The first step omits Previous; the last step relabels Next to the Close label.
 */
export function buildStepPlan(params: BuildStepPlanParams): StepPlan {
  const { resolution, step, isFirst, isLast, accessNote, labels } = params;

  if (resolution === 'role-gated-stop') {
    return {
      kind: 'role-gated-stop',
      popover: {
        title: labels.roleGatedTitle,
        description: accessNote ?? labels.roleGatedFallbackBody,
        showButtons: ['close'],
        doneBtnText: labels.close,
      },
    };
  }

  // First step hides Previous; later steps show it.
  const showButtons: StepButton[] = isFirst
    ? ['next', 'close']
    : ['next', 'previous', 'close'];

  // On the last step the Next button is relabeled to the Close label so the
  // final advance reads as ending the tour.
  const navPopover = {
    title: step.title,
    description: step.body,
    showButtons,
    nextBtnText: isLast ? labels.close : labels.next,
    prevBtnText: labels.prev,
    doneBtnText: labels.close,
  };

  if (resolution === 'spotlight') {
    return {
      kind: 'spotlight',
      element: anchorSelector(step.anchor as string),
      popover: navPopover,
    };
  }

  // text-continue: on the right route but the control is absent.
  return {
    kind: 'text-continue',
    popover: navPopover,
  };
}

/**
 * Whether the current step should make revealing the NEXT control mandatory.
 *
 * Some steps spotlight a control whose only job is to OPEN a form/dialog (for
 * example the "Registrar movimiento" or "Nuevo evento" button). The next step
 * then targets a field inside that form. If the user tapped Siguiente without
 * opening it, the following steps would point at controls that are not on screen.
 *
 * So: when we are spotlighting a control, the next step targets an anchor on the
 * SAME screen, and that anchor is NOT yet in the DOM, the runner hides Siguiente
 * and instead auto-advances once the anchor appears (the user opened the form).
 * That makes opening the form the only way forward. Pure: the DOM presence of the
 * next anchor is passed in as nextAnchorPresent.
 */
export function shouldGateForReveal(params: {
  resolution: StepResolution;
  nextStep: TourStep | undefined;
  currentPathname: string;
  nextAnchorPresent: boolean;
}): boolean {
  const { resolution, nextStep, currentPathname, nextAnchorPresent } = params;
  if (resolution !== 'spotlight') return false;
  if (!nextStep || !nextStep.anchor) return false;
  // The next step must be reachable on the current screen (no navigation), so the
  // only thing between here and it is a UI element the user must open.
  if (nextStep.route && nextStep.route !== currentPathname) return false;
  return !nextAnchorPresent;
}

/** What waitForSettled reports back once it resolves. */
export type SettledResult = {
  /**
   * The pathname we observed when the wait resolved: the step route if the
   * element appeared, otherwise the first off-route pathname a guard sent us to.
   */
  settledPathname: string;
  /** Whether the step's anchor element is present at that pathname. */
  elementPresent: boolean;
};

export type WaitForSettledOptions = {
  /** The step's REAL route; undefined for an info-only step. */
  stepRoute: string | undefined;
  /** The step's anchor id; undefined for an info-only step. */
  anchor: string | undefined;
  /** Total time budget in ms before we give up and report the current state. */
  budgetMs?: number;
  /** Poll interval in ms. */
  intervalMs?: number;
  /** Reads the current pathname. Injectable for tests; defaults to window.location.pathname. */
  readPathname?: () => string;
  /** Reads whether the anchor element is present. Injectable for tests; defaults to a DOM query. */
  readElementPresent?: (anchor: string) => boolean;
};

const DEFAULT_BUDGET_MS = 2000;
const DEFAULT_INTERVAL_MS = 50;

function defaultReadPathname(): string {
  return typeof window !== 'undefined' ? window.location.pathname : '';
}

function defaultReadElementPresent(anchor: string): boolean {
  if (typeof document === 'undefined') return false;
  return document.querySelector(anchorSelector(anchor)) !== null;
}

/**
 * Wait for the app to settle after a navigation, up to a 2000 ms budget, then
 * report the pathname we observe and whether the step element is present.
 *
 * It tolerates the loader phase that route guards show while roles resolve:
 * while the pathname still equals the step route but the target element is
 * absent, it keeps polling (the element may still be loading). It resolves as
 * soon as ANY of:
 *   - the target element appears at the step route (ready to spotlight), OR
 *   - the pathname leaves the step route (a guard redirected us). It resolves on
 *     the FIRST off-route pathname it sees, which for a multi-hop redirect may be
 *     an intermediate hop (for example '/' before RootGate forwards to '/home'),
 *     not necessarily the final landing. That is fine: classifyStep treats ANY
 *     pathname other than the step route as role-gated-stop, so the exact off-
 *     route value never changes the decision, OR
 *   - the budget elapses (we report whatever is current).
 *
 * For an info-only step (no route, no anchor) it resolves immediately.
 */
export function waitForSettled(opts: WaitForSettledOptions): Promise<SettledResult> {
  const {
    stepRoute,
    anchor,
    budgetMs = DEFAULT_BUDGET_MS,
    intervalMs = DEFAULT_INTERVAL_MS,
    readPathname = defaultReadPathname,
    readElementPresent = defaultReadElementPresent,
  } = opts;

  const elementPresent = () => (anchor ? readElementPresent(anchor) : false);

  return new Promise<SettledResult>((resolve) => {
    // An info-only step with no route has nothing to wait for.
    if (!stepRoute) {
      resolve({ settledPathname: readPathname(), elementPresent: elementPresent() });
      return;
    }

    const start = Date.now();

    const check = (): boolean => {
      const pathname = readPathname();
      const present = elementPresent();

      // The element is here at the step route: ready.
      if (pathname === stepRoute && present) {
        resolve({ settledPathname: pathname, elementPresent: true });
        return true;
      }
      // We left the step route: a guard moved us. Resolve on this first off-route
      // pathname (it may be an intermediate hop of a multi-hop redirect; that is
      // fine, classifyStep treats any non-step-route as role-gated-stop).
      if (pathname !== stepRoute) {
        resolve({ settledPathname: pathname, elementPresent: present });
        return true;
      }
      // Budget elapsed: report whatever is current (still on route, element
      // absent: the runner will classify this as text-continue).
      if (Date.now() - start >= budgetMs) {
        resolve({ settledPathname: pathname, elementPresent: present });
        return true;
      }
      return false;
    };

    // Resolve synchronously if we are already settled, otherwise poll. We keep
    // polling while on the step route with the element absent (the loader phase).
    if (check()) return;
    const timer = setInterval(() => {
      if (check()) clearInterval(timer);
    }, intervalMs);
  });
}
