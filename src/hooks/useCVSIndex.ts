import { useQuery } from '@tanstack/react-query';

export interface MonthlyIndexPoint {
  date: string;
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
}

export function useCVSIndex() {
  return useQuery({
    queryKey: ['cvs-index'],
    queryFn: async (): Promise<{ monthly: MonthlyIndexPoint[]; quarterly: QuarterlyIndex[]; fetchError: boolean }> => {
      try {
        const res = await fetch(
          'https://apis.datos.gob.ar/series/api/series/?ids=173.1_IS_2016_M_13&limit=16&sort=desc&format=json'
        );
        if (!res.ok) throw new Error('API error');
        const json = await res.json();

        const raw: [string, number | null][] = json?.data ?? [];

        const monthly: MonthlyIndexPoint[] = raw
          .filter(([, v]) => v !== null)
          .map(([date, value]) => ({
            date,
            monthLabel: new Date(date).toLocaleDateString('es-AR', { month: 'short', year: 'numeric' }),
            variation: value as number,
          }))
          .reverse();

        const quarterMap: Record<string, MonthlyIndexPoint[]> = {};
        for (const point of monthly) {
          const d = new Date(point.date);
          const year = d.getFullYear();
          const q = Math.floor(d.getMonth() / 3) + 1;
          const key = `Q${q}-${year}`;
          if (!quarterMap[key]) quarterMap[key] = [];
          quarterMap[key].push(point);
        }

        const quarterLabels: Record<number, string> = {
          1: 'Ene–Mar',
          2: 'Abr–Jun',
          3: 'Jul–Sep',
          4: 'Oct–Dic',
        };

        const quarterly: QuarterlyIndex[] = Object.entries(quarterMap)
          .filter(([, pts]) => pts.length === 3)
          .map(([key, pts]) => {
            const [qStr, yearStr] = key.split('-');
            const q = parseInt(qStr.replace('Q', ''));
            const year = parseInt(yearStr);
            const cvs = (pts.reduce((acc, p) => acc * (1 + p.variation / 100), 1) - 1) * 100;
            return {
              quarterId: key,
              quarterLabel: `${qStr} ${year} (${quarterLabels[q]})`,
              year,
              quarter: q,
              months: pts.map((p) => p.date.slice(0, 7)),
              cvs: parseFloat(cvs.toFixed(2)),
            };
          })
          .sort((a, b) => b.year - a.year || b.quarter - a.quarter);

        return { monthly, quarterly, fetchError: false };
      } catch {
        return { monthly: [], quarterly: [], fetchError: true };
      }
    },
    staleTime: 1000 * 60 * 60,
    retry: 1,
  });
}
