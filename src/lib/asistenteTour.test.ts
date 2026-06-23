import { describe, it, expect } from 'vitest';

import {
  classifyStep,
  waitForSettled,
  anchorSelector,
  type StepResolution,
} from '@/lib/asistenteTour';

/**
 * Pure-core tests for the asistente guided tour (Phase 2 Slice 1, risk spike).
 * These exercise the deterministic step classifier and the post-navigation
 * settled wait WITHOUT a DOM or React, which is exactly the point: the
 * role-gated-stop, text-continue and spotlight decisions must be provable.
 */

describe('classifyStep', () => {
  it("returns 'role-gated-stop' when the settled path differs from the step route", () => {
    // The two-hop admin redirect: a non-admin asks for /log-payment, the guard
    // sends them to '/', RootGate then to '/home'. We compare against the REAL
    // step route, so any landing that is not /log-payment is a stop.
    const r: StepResolution = classifyStep('/home', '/log-payment', true);
    expect(r).toBe('role-gated-stop');
  });

  it("returns 'role-gated-stop' even if an element happens to be present off-route", () => {
    // Route mismatch dominates: presence of some element elsewhere is irrelevant.
    expect(classifyStep('/', '/log-payment', true)).toBe('role-gated-stop');
  });

  it("returns 'text-continue' when on the right route but the element is absent", () => {
    expect(classifyStep('/log-payment', '/log-payment', false)).toBe('text-continue');
  });

  it("returns 'spotlight' when on the right route and the element is present", () => {
    expect(classifyStep('/log-payment', '/log-payment', true)).toBe('spotlight');
  });

  it("treats an info-only step (no route) as 'spotlight' when present is true", () => {
    // The runner passes elementPresent=true for an info-only step (no anchor),
    // so it spotlights its caption rather than falling back to text-continue.
    expect(classifyStep('/anything', undefined, true)).toBe('spotlight');
  });

  it("an info-only step still reports 'text-continue' if present is false", () => {
    // Defensive: with no route the role gate cannot fire, so the only fork left
    // is on element presence.
    expect(classifyStep('/anything', undefined, false)).toBe('text-continue');
  });
});

describe('anchorSelector', () => {
  it('builds the data-asistente attribute selector', () => {
    expect(anchorSelector('pago-cuenta')).toBe('[data-asistente="pago-cuenta"]');
  });
});

describe('waitForSettled', () => {
  it('resolves immediately for an info-only step with no route', async () => {
    const res = await waitForSettled({
      stepRoute: undefined,
      anchor: undefined,
      readPathname: () => '/home',
      readElementPresent: () => false,
    });
    expect(res.settledPathname).toBe('/home');
    expect(res.elementPresent).toBe(false);
  });

  it('resolves as soon as the element appears at the step route', async () => {
    let present = false;
    // The element shows up after a couple of polls (the loader phase).
    setTimeout(() => {
      present = true;
    }, 60);
    const res = await waitForSettled({
      stepRoute: '/log-payment',
      anchor: 'pago-cuenta',
      intervalMs: 10,
      budgetMs: 2000,
      readPathname: () => '/log-payment',
      readElementPresent: () => present,
    });
    expect(res.settledPathname).toBe('/log-payment');
    expect(res.elementPresent).toBe(true);
  });

  it('resolves when the path redirects away from the step route', async () => {
    let path = '/log-payment';
    // A guard moves us off-route mid-loader (the two-hop redirect end state).
    setTimeout(() => {
      path = '/home';
    }, 60);
    const res = await waitForSettled({
      stepRoute: '/log-payment',
      anchor: 'pago-cuenta',
      intervalMs: 10,
      budgetMs: 2000,
      readPathname: () => path,
      readElementPresent: () => false,
    });
    expect(res.settledPathname).toBe('/home');
    expect(res.elementPresent).toBe(false);
  });

  it('gives up after the budget, reporting the still-loading state', async () => {
    // On the route the whole time but the element never appears: the runner will
    // classify this as text-continue.
    const start = Date.now();
    const res = await waitForSettled({
      stepRoute: '/log-payment',
      anchor: 'pago-cuenta',
      intervalMs: 20,
      budgetMs: 120,
      readPathname: () => '/log-payment',
      readElementPresent: () => false,
    });
    expect(Date.now() - start).toBeGreaterThanOrEqual(100);
    expect(res.settledPathname).toBe('/log-payment');
    expect(res.elementPresent).toBe(false);
  });
});
