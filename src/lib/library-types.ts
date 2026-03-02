export type MasonicGrade = 'profano' | 'aprendiz' | 'companero' | 'maestro';
export type BookStatus = 'available' | 'on_loan';
export type TransferRequestStatus = 'pending' | 'approved' | 'rejected';

export interface Book {
  id: string;
  title: string;
  author: string;
  edition: string | null;
  publication_date: string | null;
  description: string | null;
  grade_level: MasonicGrade;
  copy_number: number;
  current_holder_id: string | null;
  held_since: string | null;
  status: BookStatus;
  is_approved: boolean;
  owner_id: string | null;
  created_at: string;
  updated_at: string;
  // joined
  holder_name?: string | null;
  owner_name?: string | null;
}

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
  // joined
  book_title?: string;
  requester_email?: string;
  new_holder_name?: string;
}

export const GRADE_HIERARCHY: Record<MasonicGrade, number> = {
  profano: 0,
  aprendiz: 1,
  companero: 2,
  maestro: 3,
};

export const GRADE_LABELS: Record<MasonicGrade, { es: string; en: string }> = {
  profano: { es: 'Profano', en: 'Profane' },
  aprendiz: { es: 'Aprendiz', en: 'Apprentice' },
  companero: { es: 'Compañero', en: 'Fellow Craft' },
  maestro: { es: 'Maestro', en: 'Master' },
};
