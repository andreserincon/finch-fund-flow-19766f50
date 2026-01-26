import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface ExtraordinaryExpense {
  id: string;
  name: string;
  description: string | null;
  default_amount: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export function useExtraordinaryExpenses() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: expenses = [], isLoading } = useQuery({
    queryKey: ['extraordinary-expenses'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('extraordinary_expenses')
        .select('*')
        .order('name');

      if (error) throw error;
      return data as ExtraordinaryExpense[];
    },
  });

  const addExpense = useMutation({
    mutationFn: async (expense: { name: string; description?: string; default_amount: number }) => {
      const { data, error } = await supabase
        .from('extraordinary_expenses')
        .insert({
          name: expense.name,
          description: expense.description || null,
          default_amount: expense.default_amount,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['extraordinary-expenses'] });
      toast({ title: 'Expense category added successfully' });
    },
    onError: (error) => {
      toast({ title: 'Failed to add expense category', description: error.message, variant: 'destructive' });
    },
  });

  const updateExpense = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<ExtraordinaryExpense> & { id: string }) => {
      const { data, error } = await supabase
        .from('extraordinary_expenses')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['extraordinary-expenses'] });
      toast({ title: 'Expense category updated successfully' });
    },
    onError: (error) => {
      toast({ title: 'Failed to update expense category', description: error.message, variant: 'destructive' });
    },
  });

  const deleteExpense = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('extraordinary_expenses')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['extraordinary-expenses'] });
      toast({ title: 'Expense category deleted successfully' });
    },
    onError: (error) => {
      toast({ title: 'Failed to delete expense category', description: error.message, variant: 'destructive' });
    },
  });

  return {
    expenses,
    isLoading,
    addExpense,
    updateExpense,
    deleteExpense,
  };
}
