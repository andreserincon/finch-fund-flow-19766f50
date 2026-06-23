import { describe, it, expect } from 'vitest';

import {
  normalizeText,
  matchTaskByText,
  canAccessTour,
  findTaskById,
  type TourAccessFlags,
} from '@/lib/asistenteMatch';
import { ASISTENTE_TASKS, CHIP_QUESTIONS } from '@/lib/asistenteKb';

/**
 * Matcher deterministico del recorrido guiado del asistente. Verifica que:
 *   - cada chip mapea a su tarea exacta via texto libre (la red de seguridad si
 *     algun dia un chip llegara sin id),
 *   - una frase ambigua o sin keyword no ofrece boton (devuelve null),
 *   - el gate de acceso es el espejo de los guards de App.tsx.
 *
 * CHIP_QUESTIONS se importa de su fuente canonica (asistenteKb) para que el
 * contrato chip -> tarea no derive si cambia la copia.
 */

describe('normalizeText', () => {
  it('lowercases and strips diacritics', () => {
    expect(normalizeText('Cápita')).toBe('capita');
    expect(normalizeText('TRANSFERÍ')).toBe('transferi');
    expect(normalizeText('envío')).toBe('envio');
  });
});

describe('matchTaskByText - every chip maps to its exact task', () => {
  for (const task of ASISTENTE_TASKS) {
    it(`chip for ${task.id} maps to ${task.id}`, () => {
      expect(matchTaskByText(CHIP_QUESTIONS[task.id])).toBe(task.id);
    });
  }
});

describe('matchTaskByText - free-text and conjugations', () => {
  it('matches a free-typed conjugation (pagué -> T1)', () => {
    expect(matchTaskByText('ya pagué la cápita, como lo registro')).toBe('T1');
  });

  it('matches accent-free free text (gasto -> T2)', () => {
    expect(matchTaskByText('quiero cargar un gasto')).toBe('T2');
  });

  it('returns null for an ambiguous phrase that hits two tasks', () => {
    // "pago" -> T1 and "evento" -> T8: two matches, so no button.
    expect(matchTaskByText('pago de evento')).toBeNull();
  });

  it('returns null for a phrase with no keyword', () => {
    expect(matchTaskByText('hola que tal')).toBeNull();
  });

  it('does not false-match the T7 stem inside unrelated words (salta/resalta)', () => {
    // "alta" used to be a T7 keyword and matched inside "salta"/"resalta"; the
    // stem is now the full phrase "dar de alta" so these resolve to no task.
    expect(matchTaskByText('salta el paso')).toBeNull();
    expect(matchTaskByText('resalta el total')).toBeNull();
    // The genuine intent still resolves to T7.
    expect(matchTaskByText('quiero dar de alta a un socio')).toBe('T7');
  });

  it('returns null for empty text', () => {
    expect(matchTaskByText('')).toBeNull();
  });
});

describe('findTaskById', () => {
  it('finds an existing task', () => {
    expect(findTaskById('T1')?.id).toBe('T1');
  });

  it('returns undefined for an unknown id', () => {
    expect(findTaskById('TX')).toBeUndefined();
  });
});

describe('canAccessTour', () => {
  const admin: TourAccessFlags = {
    isAdmin: true,
    canViewTreasury: true,
    isMemberOnly: false,
  };
  // Venerable (vm): can view treasury but is not admin and is not member-only.
  const vmLike: TourAccessFlags = {
    isAdmin: false,
    canViewTreasury: true,
    isMemberOnly: false,
  };
  const memberOnly: TourAccessFlags = {
    isAdmin: false,
    canViewTreasury: true,
    isMemberOnly: true,
  };
  const noAccess: TourAccessFlags = {
    isAdmin: false,
    canViewTreasury: false,
    isMemberOnly: false,
  };

  it('admin task: admin yes, vm-like no, member-only no', () => {
    expect(canAccessTour('admin', admin)).toBe(true);
    expect(canAccessTour('admin', vmLike)).toBe(false);
    expect(canAccessTour('admin', memberOnly)).toBe(false);
  });

  it('staff task: vm-like yes, member-only no, no-access no', () => {
    expect(canAccessTour('staff', vmLike)).toBe(true);
    expect(canAccessTour('staff', admin)).toBe(true);
    expect(canAccessTour('staff', memberOnly)).toBe(false);
    expect(canAccessTour('staff', noAccess)).toBe(false);
  });

  it('treasury task: anyone who can view treasury yes, no-access no', () => {
    expect(canAccessTour('treasury', vmLike)).toBe(true);
    expect(canAccessTour('treasury', memberOnly)).toBe(true);
    expect(canAccessTour('treasury', admin)).toBe(true);
    expect(canAccessTour('treasury', noAccess)).toBe(false);
  });
});
