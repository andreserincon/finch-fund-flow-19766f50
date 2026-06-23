import { describe, it, expect } from 'vitest';

import {
  ASISTENTE_TASKS,
  ASISTENTE_GLOSSARY,
  buildKbText,
} from '@/lib/asistenteKb';

/**
 * KB grounding / regression for the asistente knowledge base. This is the
 * client-side grounding check that stands in for the "cómo-hago" regression set:
 * it verifies the static facts the model is grounded on (the eight tasks, their
 * screens/routes/steps, the money-write access note, and the glossary). The
 * live-model answer correctness is a separate post-deploy check.
 */

const MONEY_WRITE_TASK_IDS = ['T1', 'T2', 'T3'] as const;

describe('ASISTENTE_TASKS', () => {
  it('has exactly the eight ids T1..T8 in order', () => {
    expect(ASISTENTE_TASKS.map((t) => t.id)).toEqual([
      'T1',
      'T2',
      'T3',
      'T4',
      'T5',
      'T6',
      'T7',
      'T8',
    ]);
  });

  it('every task has a non-empty screen, a route starting with "/" and 3+ ordered steps', () => {
    for (const task of ASISTENTE_TASKS) {
      expect(task.screen.trim().length, `screen for ${task.id}`).toBeGreaterThan(0);
      expect(task.route.startsWith('/'), `route for ${task.id}`).toBe(true);
      expect(task.steps.length, `step count for ${task.id}`).toBeGreaterThanOrEqual(3);
      // Each step is a non-empty string.
      for (const step of task.steps) {
        expect(typeof step).toBe('string');
        expect(step.trim().length, `a step in ${task.id}`).toBeGreaterThan(0);
      }
    }
  });

  it('every task has a non-empty title and nav', () => {
    for (const task of ASISTENTE_TASKS) {
      expect(task.title.trim().length, `title for ${task.id}`).toBeGreaterThan(0);
      expect(task.nav.trim().length, `nav for ${task.id}`).toBeGreaterThan(0);
    }
  });

  it('the money-write tasks T1, T2, T3 carry the access note; others may not', () => {
    for (const id of MONEY_WRITE_TASK_IDS) {
      const task = ASISTENTE_TASKS.find((t) => t.id === id);
      expect(task, `task ${id} exists`).toBeDefined();
      expect(task?.note, `access note for ${id}`).toBeTruthy();
      expect(task?.note ?? '', `access note mentions the role for ${id}`).toMatch(
        /Tesorero|Administrador/,
      );
    }
  });

  it('the money-write access note is shared verbatim across T1, T2, T3', () => {
    const notes = MONEY_WRITE_TASK_IDS.map(
      (id) => ASISTENTE_TASKS.find((t) => t.id === id)?.note,
    );
    expect(new Set(notes).size).toBe(1);
  });
});

describe('buildKbText', () => {
  const kb = buildKbText();

  it('includes each task screen name and its route', () => {
    for (const task of ASISTENTE_TASKS) {
      expect(kb, `screen ${task.screen}`).toContain(task.screen);
      expect(kb, `route ${task.route}`).toContain(task.route);
    }
  });

  it('includes the shared money-write access note', () => {
    const note = ASISTENTE_TASKS.find((t) => t.id === 'T1')?.note ?? '';
    expect(note.length).toBeGreaterThan(0);
    expect(kb).toContain(note);
  });

  it('is a non-empty plain-text string', () => {
    expect(typeof kb).toBe('string');
    expect(kb.trim().length).toBeGreaterThan(0);
  });
});

describe('ASISTENTE_GLOSSARY', () => {
  it('includes capita, impago and demorado with non-empty definitions', () => {
    for (const term of ['capita', 'impago', 'demorado']) {
      expect(ASISTENTE_GLOSSARY, `term ${term}`).toHaveProperty(term);
      expect(ASISTENTE_GLOSSARY[term].trim().length, `definition for ${term}`).toBeGreaterThan(0);
    }
  });
});
