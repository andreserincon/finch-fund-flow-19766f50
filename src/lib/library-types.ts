/**
 * @file library-types.ts
 * @description TypeScript types and constants for the lodge library
 *   module (physical and digital books, transfer requests, grades).
 */

/* ── Enums ── */

/** Masonic degree level (also used to gate book visibility) */
export type MasonicGrade = 'profano' | 'aprendiz' | 'companero' | 'maestro';

/** Physical book availability */
export type BookStatus = 'available' | 'on_loan';

/** Lifecycle state of a book transfer request */
export type TransferRequestStatus = 'pending' | 'approved' | 'rejected';

/* ── Book language support ── */

/** Supported book languages (ISO 639-1 codes) */
export const BOOK_LANGUAGES = [
  'es', 'en', 'pt', 'fr', 'de', 'it', 'la',
] as const;

export type BookLanguage = typeof BOOK_LANGUAGES[number];

/** Human-readable labels for each language in ES and EN */
export const LANGUAGE_LABELS: Record<BookLanguage, { es: string; en: string }> = {
  es: { es: 'Español', en: 'Spanish' },
  en: { es: 'Inglés', en: 'English' },
  pt: { es: 'Portugués', en: 'Portuguese' },
  fr: { es: 'Francés', en: 'French' },
  de: { es: 'Alemán', en: 'German' },
  it: { es: 'Italiano', en: 'Italian' },
  la: { es: 'Latín', en: 'Latin' },
};

/* ── Interfaces ── */

/** A physical book in the library catalogue */
export interface Book {
  id: string;
  title: string;
  author: string;
  edition: string | null;
  publication_date: string | null;
  description: string | null;
  /** Grade required to view/access this book */
  grade_level: MasonicGrade;
  copy_number: number;
  current_holder_id: string | null;
  held_since: string | null;
  status: BookStatus;
  is_approved: boolean;
  owner_id: string | null;
  language: string;
  created_at: string;
  updated_at: string;
  /** Joined from members table – current holder's name */
  holder_name?: string | null;
  /** Joined from members table – book owner's name */
  owner_name?: string | null;
}

/** A request to transfer a book to a new holder */
export interface BookTransferRequest {
  id: string;
  book_id: string;
  requested_by: string;
  new_holder_id: string;
  status: TransferRequestStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  notes: string | null;
  created_at: string;
  /** Joined fields */
  book_title?: string;
  requester_email?: string;
  current_holder_name?: string | null;
  new_holder_name?: string;
}

/* ── Constants ── */

/** Numeric hierarchy for grade comparison (higher = more access) */
export const GRADE_HIERARCHY: Record<MasonicGrade, number> = {
  profano: 0,
  aprendiz: 1,
  companero: 2,
  maestro: 3,
};

/** Human-readable grade labels in ES and EN */
export const GRADE_LABELS: Record<MasonicGrade, { es: string; en: string }> = {
  profano: { es: 'Profano', en: 'Profane' },
  aprendiz: { es: 'Aprendiz', en: 'Apprentice' },
  companero: { es: 'Compañero', en: 'Fellow Craft' },
  maestro: { es: 'Maestro', en: 'Master' },
};
