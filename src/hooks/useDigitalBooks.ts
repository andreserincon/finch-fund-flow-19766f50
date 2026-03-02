import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import type { MasonicGrade } from '@/lib/library-types';
import { GRADE_HIERARCHY } from '@/lib/library-types';

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

  const visibleGrades = Object.entries(GRADE_HIERARCHY)
    .filter(([_, level]) => level <= maxGradeLevel)
    .map(([grade]) => grade) as MasonicGrade[];

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

  const uploadBook = useMutation({
    mutationFn: async ({
      file,
      title,
      author,
      description,
      gradeLevel,
      userId,
    }: {
      file: File;
      title: string;
      author: string;
      description?: string;
      gradeLevel: MasonicGrade;
      userId: string;
    }) => {
      // Sanitize filename for storage
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const filePath = `${userId}/${Date.now()}_${safeName}`;
      const { error: uploadError } = await supabase.storage
        .from('digital-books')
        .upload(filePath, file, { contentType: 'application/pdf' });

      if (uploadError) throw uploadError;

      // Insert record
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
        // Clean up uploaded file on error
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

  const rejectBook = useMutation({
    mutationFn: async (book: DigitalBook) => {
      // Delete file from storage
      await supabase.storage.from('digital-books').remove([book.file_path]);
      // Delete record
      const { error } = await supabase.from('digital_books').delete().eq('id', book.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['digital-books'] });
      toast.success(t('digitalLibrary.rejected'));
    },
    onError: () => toast.error(t('digitalLibrary.rejectError')),
  });

  const getDownloadUrl = async (filePath: string) => {
    const { data, error } = await supabase.storage
      .from('digital-books')
      .createSignedUrl(filePath, 60 * 5); // 5 min
    if (error) throw error;
    return data.signedUrl;
  };

  return {
    digitalBooks: digitalBooks || [],
    isLoading,
    uploadBook,
    approveBook,
    rejectBook,
    getDownloadUrl,
  };
}
