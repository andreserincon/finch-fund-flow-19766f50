import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface MonthlyReport {
  id: string;
  report_year: number;
  report_month: number;
  status: 'generating' | 'generated' | 'failed';
  generated_at: string | null;
  generated_by: string | null;
  pdf_path: string | null;
  bank_balance: number;
  great_lodge_balance: number;
  savings_balance: number;
  total_inflows: number;
  total_outflows: number;
  net_result: number;
  outstanding_member_debt: number;
  prepaid_member_credit: number;
  net_treasury_position: number;
  expected_monthly_fees: number;
  collected_monthly_fees: number;
  collection_percentage: number;
  members_missing_payment: number;
  created_at: string;
  updated_at: string;
}

export function useMonthlyReports() {
  const queryClient = useQueryClient();

  const reportsQuery = useQuery({
    queryKey: ['monthly_reports'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('monthly_reports')
        .select('*')
        .order('report_year', { ascending: false })
        .order('report_month', { ascending: false });

      if (error) throw error;
      return data as MonthlyReport[];
    },
  });

  const generateReport = useMutation({
    mutationFn: async ({ year, month, forceRegenerate = false }: { 
      year: number; 
      month: number; 
      forceRegenerate?: boolean;
    }) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('No session');

      const response = await supabase.functions.invoke('generate-monthly-report', {
        body: { year, month, forceRegenerate },
      });

      if (response.error) {
        throw new Error(response.error.message || 'Failed to generate report');
      }

      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['monthly_reports'] });
      toast.success(data.message || 'Reporte generado exitosamente');
    },
    onError: (error: Error) => {
      if (error.message.includes('already exists')) {
        toast.error('El reporte para este mes ya existe');
      } else {
        toast.error(`Error al generar reporte: ${error.message}`);
      }
    },
  });

  const getReportPdfUrl = async (pdfPath: string): Promise<string | null> => {
    const { data, error } = await supabase.storage
      .from('reports')
      .createSignedUrl(pdfPath, 3600); // 1 hour expiry

    if (error) {
      console.error('Error creating signed URL:', error);
      toast.error('Error al obtener el reporte');
      return null;
    }

    // Supabase SDK returns full URL in signedUrl property
    if (data?.signedUrl) {
      // If it's a relative URL, prepend the Supabase storage URL
      if (data.signedUrl.startsWith('/')) {
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        return `${supabaseUrl}/storage/v1${data.signedUrl}`;
      }
      return data.signedUrl;
    }
    
    return null;
  };

  return {
    reports: reportsQuery.data ?? [],
    isLoading: reportsQuery.isLoading,
    error: reportsQuery.error,
    generateReport,
    getReportPdfUrl,
  };
}