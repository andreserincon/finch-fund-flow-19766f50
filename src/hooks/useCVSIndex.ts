import { useQuery } from '@tanstack/react-query';

export interface MonthlyIndexPoint {
  monthKey: string;   // "2025-01"
  monthLabel: string; // "Ene 2025"
  variation: number;  // monthly % variation e.g. 3.5
}

export interface QuarterlyIndex {
  quarterId: string;    // "Q1-2025"
  quarterLabel: string; // "Q1 2025 (Ene–Mar)"
  year: number;
  quarter: number;      // 1–4
  months: string[];     // ["2025-01", "2025-02", "2025-03"]
  cvs: number;          // quarterly CVS % compounded
  monthlyBreakdown: { label: string; variation: number }[];
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const PROXY_URL = `${SUPABASE_URL}/functions/v1/cvs-proxy`;

const MONTH_NAMES_ES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
const QUARTER_RANGES: Record<number, string> = { 1: 'Ene–Mar', 2: 'Abr–Jun', 3: 'Jul–Sep', 4: 'Oct–Dic' };

export function useCVSIndex() {
  return useQuery({
    queryKey: ['cvs-index-api'],
    queryFn: async (): Promise<{
      monthly: MonthlyIndexPoint[];
      quarterly: QuarterlyIndex[];
      fetchError: boolean;
    }> => {
      try {
        const res = await fetch(PROXY_URL, { cache: 'no-cache' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const contentType = res.headers.get('content-type') || '';
        if (!contentType.includes('application/json')) {
          const text = await res.text();
          console.error('CVS proxy returned non-JSON:', text.substring(0, 100));
          return { monthly: [], quarterly: [], fetchError: true };
        }
        const json = await res.json();

        // json.data is an array of [date, value] pairs sorted desc
        const dataPoints: [string, number][] = json.data;
        if (!dataPoints || dataPoints.length < 2) {
          return { monthly: [], quarterly: [], fetchError: true };
        }

        // Sort ascending by date
        const sorted = [...dataPoints]
          .filter(([, v]) => v != null)
          .sort((a, b) => a[0].localeCompare(b[0]));

        // Compute monthly % variations
        const monthly: MonthlyIndexPoint[] = [];
        for (let i = 1; i < sorted.length; i++) {
          const prev = sorted[i - 1][1];
          const curr = sorted[i][1];
          const dateStr = sorted[i][0]; // "YYYY-MM-DD"
          const monthKey = dateStr.slice(0, 7); // "YYYY-MM"
          const [year, month] = monthKey.split('-').map(Number);
          const variation = parseFloat(((curr / prev - 1) * 100).toFixed(2));
          monthly.push({
            monthKey,
            monthLabel: `${MONTH_NAMES_ES[month - 1]} ${year}`,
            variation,
          });
        }

        // Group into complete quarters
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
          .slice(0, 4);

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
