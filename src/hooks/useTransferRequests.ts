import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import type { BookTransferRequest } from '@/lib/library-types';

export function useTransferRequests() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const { data: requests, isLoading } = useQuery({
    queryKey: ['transfer-requests'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('book_transfer_requests')
        .select('*, books(title), members!book_transfer_requests_new_holder_id_fkey(full_name)')
        .order('created_at', { ascending: false });

      if (error) throw error;

      return (data || []).map((req: any) => ({
        ...req,
        book_title: req.books?.title || '',
        new_holder_name: req.members?.full_name || '',
      })) as BookTransferRequest[];
    },
  });

  const createRequest = useMutation({
    mutationFn: async (req: { book_id: string; requested_by: string; new_holder_id: string }) => {
      const { error } = await supabase.from('book_transfer_requests').insert(req as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transfer-requests'] });
      toast.success(t('library.requestSubmitted'));
    },
    onError: () => toast.error(t('library.requestError')),
  });

  const reviewRequest = useMutation({
    mutationFn: async ({ id, status, reviewed_by, notes }: { id: string; status: 'approved' | 'rejected'; reviewed_by: string; notes?: string }) => {
      // Update request
      const { error } = await supabase
        .from('book_transfer_requests')
        .update({ status, reviewed_by, reviewed_at: new Date().toISOString(), notes } as any)
        .eq('id', id);
      if (error) throw error;

      // If approved, update the book
      if (status === 'approved') {
        const { data: request } = await supabase
          .from('book_transfer_requests')
          .select('book_id, new_holder_id')
          .eq('id', id)
          .single();
        
        if (request) {
          const { error: bookError } = await supabase
            .from('books')
            .update({
              current_holder_id: request.new_holder_id,
              held_since: new Date().toISOString().split('T')[0],
              status: 'on_loan',
            } as any)
            .eq('id', request.book_id);
          if (bookError) throw bookError;
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transfer-requests'] });
      queryClient.invalidateQueries({ queryKey: ['books'] });
      toast.success(t('library.requestReviewed'));
    },
    onError: () => toast.error(t('library.requestReviewError')),
  });

  return { requests: requests || [], isLoading, createRequest, reviewRequest };
}
