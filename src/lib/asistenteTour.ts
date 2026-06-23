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
