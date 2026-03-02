/**
 * @file useTransferRequests.ts
 * @description Hook for managing book transfer requests in the library.
 *   Members can request a book transfer to themselves; librarians
 *   review (approve/reject) the requests. Approving a request
 *   automatically updates the book's holder and status.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import type { BookTransferRequest } from '@/lib/library-types';

export function useTransferRequests() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  /** Fetch all transfer requests with joined book & member names */
  const { data: requests, isLoading } = useQuery({
    queryKey: ['transfer-requests'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('book_transfer_requests')
        .select('*, books(title, current_holder_id, holder:members!books_current_holder_id_fkey(full_name)), members!book_transfer_requests_new_holder_id_fkey(full_name)')
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Flatten joined data into a cleaner shape
      return (data || []).map((req: any) => ({
        ...req,
        book_title: req.books?.title || '',
        current_holder_name: req.books?.holder?.full_name || null,
        new_holder_name: req.members?.full_name || '',
      })) as BookTransferRequest[];
    },
  });

  /** Submit a new transfer request */
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

  /**
   * Review (approve or reject) a transfer request.
   * If approved, also updates the book's current_holder_id and status.
   */
  const reviewRequest = useMutation({
    mutationFn: async ({ id, status, reviewed_by, notes }: {
      id: string;
      status: 'approved' | 'rejected';
      reviewed_by: string;
      notes?: string;
    }) => {
      // Mark the request as reviewed
      const { error } = await supabase
        .from('book_transfer_requests')
        .update({ status, reviewed_by, reviewed_at: new Date().toISOString(), notes } as any)
        .eq('id', id);
      if (error) throw error;

      // If approved, transfer the book to the new holder
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
