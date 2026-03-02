/**
 * @file useDigitalBooks.ts
 * @description Hook for managing digital (PDF) books stored in
 *   Supabase Storage. Supports upload, approval workflow,
 *   rejection (with file cleanup), and signed download URLs.
 *   Books are grade-filtered just like physical books.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import type { MasonicGrade } from '@/lib/library-types';
import { GRADE_HIERARCHY } from '@/lib/library-types';

/** Row shape from the `digital_books` table */
export interface DigitalBook {
  id: string;
  title: string;
  author: string;
  description: string | null;
  grade_level: MasonicGrade;
  file_path: string;
  file_size_bytes: number | null;
  uploaded_by: string;
  is_approved: boolean;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
}

export function useDigitalBooks(userGrade: MasonicGrade = 'aprendiz') {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const maxGradeLevel = GRADE_HIERARCHY[userGrade];

  /** Grades the user is allowed to see */
  const visibleGrades = Object.entries(GRADE_HIERARCHY)
    .filter(([_, level]) => level <= maxGradeLevel)
    .map(([grade]) => grade) as MasonicGrade[];

  /* ── Query: all digital books within visible grades ── */
  const { data: digitalBooks, isLoading } = useQuery({
    queryKey: ['digital-books', userGrade],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('digital_books')
        .select('*')
        .in('grade_level', visibleGrades)
        .order('title');

      if (error) throw error;
      return (data || []) as DigitalBook[];
    },
  });

  /* ── Mutation: upload a PDF and create a DB record ── */
  const uploadBook = useMutation({
    mutationFn: async ({
      file, title, author, description, gradeLevel, userId,
    }: {
      file: File;
      title: string;
      author: string;
      description?: string;
      gradeLevel: MasonicGrade;
      userId: string;
    }) => {
      // Sanitize the filename for safe storage paths
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const filePath = `${userId}/${Date.now()}_${safeName}`;

      // Upload the file to the "digital-books" bucket
      const { error: uploadError } = await supabase.storage
        .from('digital-books')
        .upload(filePath, file, { contentType: 'application/pdf' });

      if (uploadError) throw uploadError;

      // Insert metadata record
      const { error: insertError } = await supabase
        .from('digital_books')
        .insert({
          title,
          author,
          description: description || null,
          grade_level: gradeLevel,
          file_path: filePath,
          file_size_bytes: file.size,
          uploaded_by: userId,
        } as any);

      if (insertError) {
        // Roll back: delete the uploaded file if DB insert fails
        await supabase.storage.from('digital-books').remove([filePath]);
        throw insertError;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['digital-books'] });
      toast.success(t('digitalLibrary.uploadSuccess'));
    },
    onError: () => toast.error(t('digitalLibrary.uploadError')),
  });

  /* ── Mutation: approve a pending book ── */
  const approveBook = useMutation({
    mutationFn: async ({ id, approvedBy }: { id: string; approvedBy: string }) => {
      const { error } = await supabase
        .from('digital_books')
        .update({
          is_approved: true,
          approved_by: approvedBy,
          approved_at: new Date().toISOString(),
        } as any)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['digital-books'] });
      toast.success(t('digitalLibrary.approved'));
    },
    onError: () => toast.error(t('digitalLibrary.approveError')),
  });

  /* ── Mutation: update grade level of a digital book ── */
  const updateDigitalBook = useMutation({
    mutationFn: async ({ id, grade_level }: { id: string; grade_level: MasonicGrade }) => {
      const { error } = await supabase
        .from('digital_books')
        .update({ grade_level } as any)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['digital-books'] });
      toast.success(t('common.saved'));
    },
    onError: () => toast.error(t('common.error')),
  });

  /* ── Mutation: reject (delete file + record) ── */
  const rejectBook = useMutation({
    mutationFn: async (book: DigitalBook) => {
      // Delete the stored file first
      await supabase.storage.from('digital-books').remove([book.file_path]);
      // Then remove the DB record
      const { error } = await supabase.from('digital_books').delete().eq('id', book.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['digital-books'] });
      toast.success(t('digitalLibrary.rejected'));
    },
    onError: () => toast.error(t('digitalLibrary.rejectError')),
  });

  /** Generate a 5-minute signed download URL for a digital book */
  const getDownloadUrl = async (filePath: string) => {
    const { data, error } = await supabase.storage
      .from('digital-books')
      .createSignedUrl(filePath, 60 * 5);
    if (error) throw error;
    return data.signedUrl;
  };

  return {
    digitalBooks: digitalBooks || [],
    isLoading,
    uploadBook,
    approveBook,
    rejectBook,
    updateDigitalBook,
    getDownloadUrl,
  };
}
