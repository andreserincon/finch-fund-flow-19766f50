import { useQuery } from '@tanstack/react-query';

export interface MonthlyIndexPoint {
  monthKey: string;
  monthLabel: string;
  variation: number;
}

export interface QuarterlyIndex {
  quarterId: string;
  quarterLabel: string;
  year: number;
  quarter: number;
  months: string[];
  cvs: number;
  monthlyBreakdown: { label: string; variation: number }[];
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const CSV_PROXY_URL = `${SUPABASE_URL}/functions/v1/cvs-proxy`;

const MONTH_NAMES_ES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
const QUARTER_RANGES: Record<number, string> = { 1: 'Ene–Mar', 2: 'Abr–Jun', 3: 'Jul–Sep', 4: 'Oct–Dic' };

export function useCVSIndex() {
  return useQuery({
    queryKey: ['cvs-index-csv'],
    queryFn: async (): Promise<{
      monthly: MonthlyIndexPoint[];
      quarterly: QuarterlyIndex[];
      fetchError: boolean;
    }> => {
      try {
        const res = await fetch(CSV_PROXY_URL);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const text = await res.text();

        const lines = text.trim().split('\n').slice(1);

        const monthlyLastValue: Record<string, number> = {};
        for (const line of lines) {
          const [dateStr, totalReg, total] = line.split(',');
          if (!dateStr) continue;
          const value = parseFloat(total || totalReg);
          if (isNaN(value)) continue;
          const monthKey = dateStr.slice(0, 7);
          monthlyLastValue[monthKey] = value;
        }

        const sortedMonths = Object.keys(monthlyLastValue).sort();

        const monthly: MonthlyIndexPoint[] = [];
        for (let i = 1; i < sortedMonths.length; i++) {
          const prevKey = sortedMonths[i - 1];
          const currKey = sortedMonths[i];
          const prev = monthlyLastValue[prevKey];
          const curr = monthlyLastValue[currKey];
          if (!prev || !curr) continue;
          const variation = parseFloat(((curr / prev - 1) * 100).toFixed(2));
          const [year, month] = currKey.split('-').map(Number);
          monthly.push({
            monthKey: currKey,
            monthLabel: `${MONTH_NAMES_ES[month - 1]} ${year}`,
            variation,
          });
        }

        const quarterMap: Record<string, MonthlyIndexPoint[]> = {};
        for (const point of monthly) {
          const [year, month] = point.monthKey.split('-').map(Number);
          const q = Math.ceil(month / 3);
          const key = `Q${q}-${year}`;
          if (!quarterMap[key]) quarterMap[key] = [];
          quarterMap[key].push(point);
        }

        const quarterly: QuarterlyIndex[] = Object.entries(quarterMap)
          .filter(([, pts]) => pts.length === 3)
          .map(([key, pts]) => {
            const [qStr, yearStr] = key.split('-');
            const q = parseInt(qStr.replace('Q', ''));
            const year = parseInt(yearStr);
            const cvs = parseFloat(
              ((pts.reduce((acc, p) => acc * (1 + p.variation / 100), 1) - 1) * 100).toFixed(2)
            );
            return {
              quarterId: key,
              quarterLabel: `${qStr} ${year} (${QUARTER_RANGES[q]})`,
              year,
              quarter: q,
              months: pts.map((p) => p.monthKey),
              cvs,
              monthlyBreakdown: pts.map((p) => ({
                label: p.monthLabel,
                variation: p.variation,
              })),
            };
          })
          .sort((a, b) => b.year - a.year || b.quarter - a.quarter)
          .slice(0, 8);

        return { monthly: monthly.slice(-15), quarterly, fetchError: false };
      } catch (err) {
        console.error('CVS fetch error:', err);
        return { monthly: [], quarterly: [], fetchError: true };
      }
    },
    staleTime: 1000 * 60 * 60,
    retry: 1,
  });
}
