import { useState, useMemo, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Calculator, Users, Sparkles, AlertTriangle, RefreshCw, Download } from 'lucide-react';
import * as XLSX from 'xlsx';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { StatCard } from '@/components/dashboard/StatCard';
import { useMonthlyFees } from '@/hooks/useMonthlyFees';
import { useMembers } from '@/hooks/useMembers';
import { useCVSIndex, QuarterlyIndex } from '@/hooks/useCVSIndex';
import { Skeleton } from '@/components/ui/skeleton';
import { Link } from 'react-router-dom';

const formatARS = (n: number) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);

const formatPct = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`;

interface ProposalKPIs {
  totalMonthlyIncome: number;
  glTotalCost: number;
  netMonthlyIncome: number;
  ourFeeIncrease: number;
  glFeeIncrease: number;
  delta: number;
  deltaVsGlYearAgo: number | null;
  yoyFeeVariation: number | null;
  yoyAccumulatedIndex: number;
  projectedGlStd: number;
  projectedGlSol: number;
}

function KPIList({ kpis, t, noGlData, baselineKpis }: { kpis: ProposalKPIs; t: (key: string) => string; noGlData?: boolean; baselineKpis?: ProposalKPIs }) {
  const isDelta = !!baselineKpis;

  const formatDelta = (val: number) => `${val >= 0 ? '+' : ''}${formatARS(val)}`;
  const formatDeltaPct = (val: number) => `${val >= 0 ? '+' : ''}${val.toFixed(1)}%`;

  const rows = isDelta ? [
    { label: t('feeCalculator.totalMonthlyIncome'), value: formatDelta(kpis.totalMonthlyIncome - baselineKpis.totalMonthlyIncome), color: kpis.totalMonthlyIncome >= baselineKpis.totalMonthlyIncome ? 'text-success' : 'text-destructive' },
    { label: t('feeCalculator.delta'), value: `${(kpis.delta - baselineKpis.delta).toFixed(1)}pp`, color: '' },
  ] : [
    { label: t('feeCalculator.totalMonthlyIncome'), value: formatARS(kpis.totalMonthlyIncome), color: '' },
    { label: t('feeCalculator.glTotalCost'), value: formatARS(kpis.glTotalCost), color: '' },
    {
      label: t('feeCalculator.netMonthlyIncome'),
      value: formatARS(kpis.netMonthlyIncome),
      color: kpis.netMonthlyIncome > 0 ? 'text-success' : 'text-overdue',
    },
    { label: t('feeCalculator.ourFeeIncrease'), value: formatPct(kpis.ourFeeIncrease), color: '' },
    {
      label: t('feeCalculator.delta'),
      value: `${kpis.delta.toFixed(1)}%`,
      color: '',
    },
    {
      label: t('feeCalculator.deltaVsGlYearAgo'),
      value: kpis.deltaVsGlYearAgo !== null ? `${kpis.deltaVsGlYearAgo.toFixed(1)}%` : t('feeCalculator.noYoyData'),
      color: 'text-muted-foreground',
    },
    {
      label: t('feeCalculator.yoyFeeVariation'),
      value: kpis.yoyFeeVariation !== null ? formatPct(kpis.yoyFeeVariation) : t('feeCalculator.noYoyData'),
      color: '',
    },
    {
      label: t('feeCalculator.yoyIndexRef'),
      value: `${kpis.yoyAccumulatedIndex.toFixed(1)}%`,
      color: 'text-muted-foreground',
    },
  ];

  return (
    <div className="space-y-1 md:space-y-2">
      {noGlData && !isDelta && (
        <p className="text-[9px] md:text-xs text-muted-foreground italic mb-1 md:mb-2">{t('feeCalculator.enterGlFees')}</p>
      )}
      {isDelta && (
        <p className="text-[9px] md:text-xs text-muted-foreground italic mb-1 md:mb-2">{t('feeCalculator.vsBaseline')}</p>
      )}
      {rows.map((row) => (
        <div key={row.label} className="flex items-center justify-between text-[10px] md:text-sm">
          <span className="text-muted-foreground truncate mr-1">{row.label}</span>
          <span className={`font-medium whitespace-nowrap ${row.color}`}>{row.value}</span>
        </div>
      ))}
    </div>
  );
}

function ProposalCard({
  name,
  badgeColor,
  bufferPct,
  proposedStd,
  proposedSol,
  kpis,
  t,
  noGlData,
  isVariant,
  baselineKpis,
}: {
  name: string;
  badgeColor: string;
  bufferPct: number;
  proposedStd: number;
  proposedSol: number;
  kpis: ProposalKPIs;
  t: (key: string, opts?: Record<string, unknown>) => string;
  noGlData?: boolean;
  isVariant?: boolean;
  baselineKpis?: ProposalKPIs;
}) {
  return (
    <Card>
      <CardHeader className="p-3 md:p-6 pb-2 md:pb-3">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-1">
          <Badge className={`${badgeColor} text-[10px] md:text-xs`}>{name}</Badge>
          <span className="text-[9px] md:text-xs text-muted-foreground hidden sm:inline">
            {t('feeCalculator.deltaVsGl', { pct: bufferPct })}
          </span>
        </div>
      </CardHeader>
      <CardContent className="p-3 md:p-6 pt-0 md:pt-0 space-y-2 md:space-y-4">
        <div className="space-y-1 md:grid md:grid-cols-2 md:gap-4 md:space-y-0">
          <div>
            <p className="text-[9px] md:text-xs text-muted-foreground">{t('feeCalculator.proposedStd')}</p>
            <p className="text-sm md:text-xl font-bold">{formatARS(proposedStd)}</p>
            <p className="text-[8px] md:text-[10px] text-muted-foreground">GL: {formatARS(kpis.projectedGlStd)}</p>
          </div>
          <div>
            <p className="text-[9px] md:text-xs text-muted-foreground">{t('feeCalculator.proposedSol')}</p>
            <p className="text-sm md:text-xl font-bold">{formatARS(proposedSol)}</p>
            <p className="text-[8px] md:text-[10px] text-muted-foreground">GL: {formatARS(kpis.projectedGlSol)}</p>
          </div>
        </div>
        <Separator />
        <KPIList kpis={kpis} t={t} noGlData={noGlData} baselineKpis={baselineKpis} />
      </CardContent>
    </Card>
  );
}

export default function FeeCalculator() {
  const { t } = useTranslation();
  const { monthlyFees, isLoading: feesLoading } = useMonthlyFees();
  const { memberBalances, isLoading: membersLoading } = useMembers();
  const { data: cvsData, isLoading: cvsLoading, refetch: refetchCvs, isFetching: cvsFetching } = useCVSIndex();

  const [selectedBaseMonth, setSelectedBaseMonth] = useState<string>('');
  const [manualCvs, setManualCvs] = useState<string>('');
  const [manualGlStd, setManualGlStd] = useState<string>('');
  const [manualGlSol, setManualGlSol] = useState<string>('');
  const [customStd, setCustomStd] = useState<string>('');
  const [customSol, setCustomSol] = useState<string>('');

  const isLoading = feesLoading || membersLoading;
  const fetchError = cvsData?.fetchError ?? false;
  const quarterly = cvsData?.quarterly ?? [];
  const monthly = cvsData?.monthly ?? [];

  // Auto-derive quarter: 2 quarters before the selected base month's quarter
  const selectedQuarterId = useMemo(() => {
    if (!selectedBaseMonth || quarterly.length === 0) return '';
    const [baseYear, baseMonthNum] = selectedBaseMonth.split('-').map(Number);
    const baseQ = Math.ceil(baseMonthNum / 3);
    // Go back 2 quarters
    let targetQ = baseQ - 2;
    let targetYear = baseYear;
    while (targetQ <= 0) {
      targetQ += 4;
      targetYear -= 1;
    }
    const targetId = `Q${targetQ}-${targetYear}`;
    // If we have this quarter in data, use it; otherwise find closest
    const found = quarterly.find(q => q.quarterId === targetId);
    return found ? found.quarterId : '';
  }, [selectedBaseMonth, quarterly]);

  const exportCvsToExcel = () => {
    try {
      if (!monthly.length) return;
      const wb = XLSX.utils.book_new();

      // ========== Sheet 1: Índice CVS ==========
      const s1Data: (string | number | null)[][] = [
        ['Índice de Salarios (INDEC) — Variación Mensual', null, null],
        [],
        ['Mes', 'Índice (base oct-2016=100)', 'Variación Mensual %'],
        ...monthly.map((p) => [p.monthLabel, p.indexValue, p.variation]),
        [],
        [],
        ['Índice Acumulado Anual (12 meses)', null, yoyAccumulated > 0 ? yoyAccumulated : 'N/D'],
        [],
        ['Fuente: Ministerio de Economía — datos.gob.ar / INDEC', null, null],
        ['💡 Para insertar gráfico: seleccioná las columnas A y C → Insertar → Gráfico de líneas', null, null],
      ];
      const ws1 = XLSX.utils.aoa_to_sheet(s1Data);
      ws1['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 2 } }];
      ws1['!cols'] = [{ wch: 14 }, { wch: 24 }, { wch: 22 }];
      ws1['!freeze'] = { xSplit: 0, ySplit: 3 };
      // Freeze pane via '!freeze' or views
      if (!ws1['!views']) ws1['!views'] = [{}];
      (ws1['!views'] as any[])[0] = { state: 'frozen', ySplit: 3 };
      XLSX.utils.book_append_sheet(wb, ws1, 'Índice CVS');

      // ========== Sheet 2: Trimestral CVS ==========
      const s2Data: (string | number | null)[][] = [
        ['Resumen Trimestral — CVS Acumulado', null, null, null, null, null],
        [],
        ['Trimestre', 'CVS Trimestral %', 'Mes 1 — Variación %', 'Mes 2 — Variación %', 'Mes 3 — Variación %', '¿Trimestre Seleccionado?'],
        ...quarterly.map((q) => [
          q.quarterLabel,
          q.cvs,
          q.monthlyBreakdown[0]?.variation ?? null,
          q.monthlyBreakdown[1]?.variation ?? null,
          q.monthlyBreakdown[2]?.variation ?? null,
          q.quarterId === selectedQuarterId ? '✓ Seleccionado' : '',
        ]),
      ];
      const ws2 = XLSX.utils.aoa_to_sheet(s2Data);
      ws2['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 5 } }];
      ws2['!cols'] = [{ wch: 26 }, { wch: 20 }, { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 22 }];
      if (!ws2['!views']) ws2['!views'] = [{}];
      (ws2['!views'] as any[])[0] = { state: 'frozen', ySplit: 3 };
      XLSX.utils.book_append_sheet(wb, ws2, 'Trimestral CVS');

      // ========== Sheet 3: Propuestas de Aranceles ==========
      const baseMonthLabel = availableFeeMonths.find(m => m.value === selectedBaseMonth)?.label ?? selectedBaseMonth ?? '';
      const quarterLabel = selectedQuarter?.quarterLabel ?? 'Manual';

      const lowP = proposals.find(p => p.buffer === -2);
      const baseP = proposals.find(p => p.buffer === 0);
      const highP = proposals.find(p => p.buffer === 2);
      const getKpiVal = (p: typeof lowP, key: keyof ProposalKPIs) => p ? p.kpis[key] : '—';
      const getCustomVal = (key: keyof ProposalKPIs) => customKPIs ? customKPIs[key] : '—';

      const s3Data: (string | number | null)[][] = [
        ['Propuestas de Aranceles — Calculadora de Aranceles', null, null, null, null, null, null],
        [],
        ['Período Base:', baseMonthLabel],
        ['Trimestre CVS:', quarterLabel],
        ['CVS Aplicado:', selectedCVS],
        ['Índice YoY Acumulado:', yoyAccumulated],
        ['Arancel GL Estándar actual:', glStdNum],
        ['Arancel GL Solidaridad actual:', glSolNum],
        ['Miembros Estándar activos:', stdMemberCount],
        ['Miembros Solidaridad activos:', solMemberCount],
        [],
        ['', 'Conservador', 'Base CVS', 'Alto', 'Personalizado'],
        ['Arancel Estándar Propuesto', lowP?.proposedStd ?? '—', baseP?.proposedStd ?? '—', highP?.proposedStd ?? '—', customKPIs ? customStdNum : '—'],
        ['Arancel Solidaridad Propuesto', lowP?.proposedSol ?? '—', baseP?.proposedSol ?? '—', highP?.proposedSol ?? '—', customKPIs ? customSolNum : '—'],
        ['GL Estándar Proyectado', getKpiVal(lowP, 'projectedGlStd'), getKpiVal(baseP, 'projectedGlStd'), getKpiVal(highP, 'projectedGlStd'), getCustomVal('projectedGlStd')],
        ['GL Solidaridad Proyectado', getKpiVal(lowP, 'projectedGlSol'), getKpiVal(baseP, 'projectedGlSol'), getKpiVal(highP, 'projectedGlSol'), getCustomVal('projectedGlSol')],
        [],
        ['Ingreso Mensual Total', getKpiVal(lowP, 'totalMonthlyIncome'), getKpiVal(baseP, 'totalMonthlyIncome'), getKpiVal(highP, 'totalMonthlyIncome'), getCustomVal('totalMonthlyIncome')],
        ['Costo Total GL', getKpiVal(lowP, 'glTotalCost'), getKpiVal(baseP, 'glTotalCost'), getKpiVal(highP, 'glTotalCost'), getCustomVal('glTotalCost')],
        ['Ingreso Neto Mensual', getKpiVal(lowP, 'netMonthlyIncome'), getKpiVal(baseP, 'netMonthlyIncome'), getKpiVal(highP, 'netMonthlyIncome'), getCustomVal('netMonthlyIncome')],
        ['Incremento Propio %', getKpiVal(lowP, 'ourFeeIncrease'), getKpiVal(baseP, 'ourFeeIncrease'), getKpiVal(highP, 'ourFeeIncrease'), getCustomVal('ourFeeIncrease')],
        ['GL % de Capita', getKpiVal(lowP, 'delta'), getKpiVal(baseP, 'delta'), getKpiVal(highP, 'delta'), getCustomVal('delta')],
        ['Variación Interanual Arancel %', lowP?.kpis.yoyFeeVariation ?? 'N/D', baseP?.kpis.yoyFeeVariation ?? 'N/D', highP?.kpis.yoyFeeVariation ?? 'N/D', customKPIs?.yoyFeeVariation ?? 'N/D'],
        ['Índice Acumulado YoY (ref.)', getKpiVal(lowP, 'yoyAccumulatedIndex'), getKpiVal(baseP, 'yoyAccumulatedIndex'), getKpiVal(highP, 'yoyAccumulatedIndex'), getCustomVal('yoyAccumulatedIndex')],
      ];
      const ws3 = XLSX.utils.aoa_to_sheet(s3Data);
      ws3['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 6 } }];
      ws3['!cols'] = [{ wch: 32 }, { wch: 20 }, { wch: 20 }, { wch: 20 }, { wch: 20 }];
      if (!ws3['!views']) ws3['!views'] = [{}];
      (ws3['!views'] as any[])[0] = { state: 'frozen', ySplit: 12 };
      XLSX.utils.book_append_sheet(wb, ws3, 'Propuestas de Aranceles');

      // ========== Sheet 4: Mi Calculadora ==========
      const s4Data: (string | number | null | { f: string })[][] = [
        ['Mi Calculadora — Espacio de Trabajo', null, null, null, null, null],
        [],
        ['Usá esta hoja para tus propios cálculos. Los valores en azul son referencias traídas de la calculadora. Podés modificar cualquier celda.'],
        [],
        [],
        ['REFERENCIAS (traídas de la calculadora)'],
        ['CVS Trimestral %', selectedCVS],
        ['Índice YoY Acumulado %', yoyAccumulated],
        ['Arancel Estándar Actual', currentStdFee],
        ['Arancel Solidaridad Actual', currentSolFee],
        ['GL Estándar', glStdNum],
        ['GL Solidaridad', glSolNum],
        ['Miembros Estándar', stdMemberCount],
        ['Miembros Solidaridad', solMemberCount],
        [],
        ['MI ESCENARIO'],
        ['Mi Arancel Estándar', null],
        ['Mi Arancel Solidaridad', null],
        ['Ajuste adicional %', null],
        ['Notas', null],
        [],
        ['CÁLCULOS AUTOMÁTICOS'],
      ];
      const ws4 = XLSX.utils.aoa_to_sheet(s4Data);
      ws4['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 5 } }];
      ws4['!cols'] = [{ wch: 30 }, { wch: 20 }, { wch: 20 }];

      // Add formula rows
      const formulaRows: [string, string][] = [
        ['Ingreso Mensual Estándar', '=B13*B17'],
        ['Ingreso Mensual Solidaridad', '=B14*B18'],
        ['Ingreso Total Mensual', '=B23+B24'],
        ['Costo GL Total', '=(B11*B13)+(B12*B14)'],
        ['Ingreso Neto Mensual', '=B25-B26'],
      ];
      const formulaStartRow = 22; // 0-indexed
      formulaRows.forEach(([label, formula], i) => {
        const r = formulaStartRow + i;
        XLSX.utils.sheet_add_aoa(ws4, [[label]], { origin: { r, c: 0 } });
        ws4[XLSX.utils.encode_cell({ r, c: 1 })] = { f: formula.slice(1), t: 'n' };
      });

      // Comparison section
      const compStart = formulaStartRow + formulaRows.length + 1;
      XLSX.utils.sheet_add_aoa(ws4, [
        [],
        ['Comparación de incrementos'],
        ['Incremento Propio (Std) %', null],
        ['Incremento CVS (ref.) %', null],
        ['Diferencia (delta) pp', null],
      ], { origin: { r: compStart, c: 0 } });
      // Add formulas for comparison
      const compDataStart = compStart + 1;
      ws4[XLSX.utils.encode_cell({ r: compDataStart + 1, c: 1 })] = { f: 'IF(B9>0,(B17-B9)/B9*100,0)', t: 'n' };
      ws4[XLSX.utils.encode_cell({ r: compDataStart + 2, c: 1 })] = { f: 'B7', t: 'n' };
      ws4[XLSX.utils.encode_cell({ r: compDataStart + 3, c: 1 })] = { f: `B${compDataStart + 2}-B${compDataStart + 3}`, t: 'n' };

      XLSX.utils.book_append_sheet(wb, ws4, 'Mi Calculadora');

      // ========== Write & Download ==========
      const fileName = `aranceles-${selectedBaseMonth?.slice(0, 7) ?? 'calculadora'}-${new Date().toISOString().slice(0, 10)}.xlsx`;
      XLSX.writeFile(wb, fileName);
      toast.success('Planilla exportada correctamente');
    } catch (err) {
      console.error('Export error:', err);
      toast.error('Error al exportar la planilla');
    }
  };

  const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

  // Available months: only first month of each quarter, up to ~4 quarters around current
  const availableFeeMonths = useMemo(() => {
    const now = new Date();
    const currentQ = Math.ceil((now.getMonth() + 1) / 3);
    const months: { value: string; label: string }[] = [];
    // Show ~3 past quarters + current + 1 future quarter
    for (let qOffset = -3; qOffset <= 1; qOffset++) {
      let q = currentQ + qOffset;
      let y = now.getFullYear();
      while (q <= 0) { q += 4; y -= 1; }
      while (q > 4) { q -= 4; y += 1; }
      const m = (q - 1) * 3 + 1; // first month of quarter
      const d = new Date(y, m - 1, 1);
      const value = d.toISOString().slice(0, 7) + '-01';
      const label = capitalize(d.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' }));
      months.push({ value, label });
    }
    return months.sort((a, b) => b.value.localeCompare(a.value));
  }, []);

  // Auto-select first month of current quarter as default base
  useEffect(() => {
    if (!selectedBaseMonth) {
      const now = new Date();
      const currentQ = Math.ceil((now.getMonth() + 1) / 3);
      const firstMonth = (currentQ - 1) * 3 + 1;
      const d = new Date(now.getFullYear(), firstMonth - 1, 1);
      setSelectedBaseMonth(d.toISOString().slice(0, 7) + '-01');
    }
  }, [selectedBaseMonth]);

  // Derive current fees from selected base month
  const { currentStdFee, currentSolFee, feeOneYearAgoStd, glStdOneYearAgo } = useMemo(() => {
    if (!monthlyFees.length || !selectedBaseMonth) return { currentStdFee: 0, currentSolFee: 0, feeOneYearAgoStd: null as number | null, glStdOneYearAgo: null as number | null };
    const feesForMonth = monthlyFees.filter((f) => f.year_month === selectedBaseMonth);
    const latestStd = feesForMonth.find((f) => f.fee_type === 'standard');
    const latestSol = feesForMonth.find((f) => f.fee_type === 'solidarity');

    const [baseYear, baseMonthNum] = selectedBaseMonth.split('-').map(Number);
    // Month -11 from base month (not -12)
    const elevenMonthsAgo = new Date(baseYear, baseMonthNum - 1 - 11, 1);
    const yearAgoStr = `${elevenMonthsAgo.getFullYear()}-${String(elevenMonthsAgo.getMonth() + 1).padStart(2, '0')}-01`;
    const stdYearAgo = monthlyFees.find((f) => f.fee_type === 'standard' && f.year_month === yearAgoStr);

    return {
      currentStdFee: latestStd?.amount ?? 0,
      currentSolFee: latestSol?.amount ?? 0,
      feeOneYearAgoStd: stdYearAgo?.amount ?? null,
      glStdOneYearAgo: stdYearAgo?.gl_standard_amount ?? null,
    };
  }, [monthlyFees, selectedBaseMonth]);

  // GL fees from selected base month, fallback to latest with GL data
  const glFromDb = useMemo(() => {
    if (!monthlyFees.length) return null;
    if (selectedBaseMonth) {
      const feesForMonth = monthlyFees.filter((f) => f.year_month === selectedBaseMonth);
      const withGl = feesForMonth.find((f) => f.gl_standard_amount !== null || f.gl_solidarity_amount !== null);
      if (withGl) {
        return {
          standard: withGl.gl_standard_amount ?? 0,
          solidarity: withGl.gl_solidarity_amount ?? 0,
          month: capitalize(new Date(withGl.year_month).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })),
        };
      }
    }
    // Fallback: latest entry with GL values
    const sorted = [...monthlyFees].sort((a, b) => b.year_month.localeCompare(a.year_month));
    const withGl = sorted.find((f) => f.gl_standard_amount !== null || f.gl_solidarity_amount !== null);
    if (!withGl) return null;
    return {
      standard: withGl.gl_standard_amount ?? 0,
      solidarity: withGl.gl_solidarity_amount ?? 0,
      month: capitalize(new Date(withGl.year_month).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })),
    };
  }, [monthlyFees, selectedBaseMonth]);

  const glStdNum = glFromDb ? glFromDb.standard : (parseFloat(manualGlStd) || 0);
  const glSolNum = glFromDb ? glFromDb.solidarity : (parseFloat(manualGlSol) || 0);
  const noGlData = glStdNum === 0 && glSolNum === 0;

  const { stdMemberCount, solMemberCount } = useMemo(() => {
    const active = memberBalances.filter((m) => m.is_active);
    return {
      stdMemberCount: active.filter((m) => m.fee_type === 'standard').length,
      solMemberCount: active.filter((m) => m.fee_type === 'solidarity').length,
    };
  }, [memberBalances]);

  // Selected quarter data
  const selectedQuarter: QuarterlyIndex | undefined = quarterly.find((q) => q.quarterId === selectedQuarterId);
  const selectedCVS = selectedQuarter ? selectedQuarter.cvs : (parseFloat(manualCvs) || 0);
  const hasCvs = selectedCVS > 0;

  // YoY: compound the selected CVS quarter + 3 prior quarters (4 total)
  const yoyAccumulated = useMemo(() => {
    if (!selectedQuarterId || quarterly.length < 4) return 0;
    const cvsIdx = quarterly.findIndex((q) => q.quarterId === selectedQuarterId);
    if (cvsIdx < 0) return 0;
    // quarterly is sorted descending, so cvsIdx is the most recent of the 4
    const prev4 = quarterly.slice(cvsIdx, cvsIdx + 4);
    if (prev4.length < 4) return 0;
    const result = (prev4.reduce((acc, q) => acc * (1 + q.cvs / 100), 1) - 1) * 100;
    console.log('[YoY Index]', { selectedQuarterId, quarters: prev4.map(q => `${q.quarterId}: ${q.cvs}%`), accumulated: result.toFixed(2) + '%' });
    return result;
  }, [quarterly, selectedQuarterId]);

  // Monthly breakdown for selected quarter
  const quarterMonthlyBreakdown = useMemo(() => {
    if (!selectedQuarter) return null;
    const points = monthly.filter((m) => selectedQuarter.months.includes(m.monthKey));
    return points;
  }, [selectedQuarter, monthly]);

  const computeKPIs = (proposedStd: number, proposedSol: number): ProposalKPIs => {
    const projectedGlStd = Math.round(glStdNum * (1 + selectedCVS / 100));
    const projectedGlSol = Math.round(glSolNum * (1 + selectedCVS / 100));
    const glTotalCost = projectedGlStd * stdMemberCount + projectedGlSol * solMemberCount;
    const totalMonthlyIncome = stdMemberCount * proposedStd + solMemberCount * proposedSol;
    const netMonthlyIncome = totalMonthlyIncome - glTotalCost;
    const ourFeeIncrease = currentStdFee > 0 ? ((proposedStd - currentStdFee) / currentStdFee) * 100 : 0;
    const glFeeIncrease = selectedCVS;
    const delta = proposedStd > 0 ? (projectedGlStd / proposedStd) * 100 : 0;
    const yoyFeeVariation =
      feeOneYearAgoStd !== null && feeOneYearAgoStd > 0
        ? ((proposedStd - feeOneYearAgoStd) / feeOneYearAgoStd) * 100
        : null;

    const deltaVsGlYearAgo =
      feeOneYearAgoStd !== null && glStdOneYearAgo !== null && feeOneYearAgoStd > 0
        ? (glStdOneYearAgo / feeOneYearAgoStd) * 100
        : null;

    return {
      totalMonthlyIncome,
      glTotalCost,
      netMonthlyIncome,
      ourFeeIncrease,
      glFeeIncrease,
      delta,
      deltaVsGlYearAgo,
      yoyFeeVariation,
      yoyAccumulatedIndex: yoyAccumulated,
      projectedGlStd,
      projectedGlSol,
    };
  };

  const proposals = useMemo(() => {
    if (!hasCvs) return [];
    const round500 = (n: number) => Math.round(n / 500) * 500;
    const baseStd = round500(currentStdFee * (1 + selectedCVS / 100));
    const baseSol = round500(currentSolFee * (1 + selectedCVS / 100));

    // "Ratio GL" proposal: proposedStd such that GL% of Capita = GL% of Capita 1 year ago
    const projectedGlStd = Math.round(glStdNum * (1 + selectedCVS / 100));
    const projectedGlSol = Math.round(glSolNum * (1 + selectedCVS / 100));
    const targetDelta = feeOneYearAgoStd !== null && glStdOneYearAgo !== null && feeOneYearAgoStd > 0
      ? (glStdOneYearAgo / feeOneYearAgoStd) * 100
      : null;
    const ceil500 = (n: number) => Math.ceil(n / 500) * 500;
    const ratioStd = targetDelta && targetDelta > 0 ? ceil500(projectedGlStd / (targetDelta / 100)) : baseStd;
    const ratioSol = targetDelta && targetDelta > 0 ? ceil500(projectedGlSol / (targetDelta / 100)) : baseSol;

    type ProposalItem = {
      name: string; color: string; isVariant: boolean;
      proposedStd: number; proposedSol: number; kpis: ProposalKPIs;
      baselineKpis?: ProposalKPIs; buffer: number;
    };

    const items: ProposalItem[] = [
      {
        buffer: 0, name: 'Ratio GL', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
        isVariant: false, proposedStd: ratioStd, proposedSol: ratioSol,
        kpis: computeKPIs(ratioStd, ratioSol),
      },
      {
        buffer: 0, name: t('feeCalculator.baseline'), color: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200',
        isVariant: false, proposedStd: baseStd, proposedSol: baseSol,
        kpis: computeKPIs(baseStd, baseSol),
      },
      {
        buffer: 0, name: 'GL 65%', color: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
        isVariant: false,
        proposedStd: ceil500(projectedGlStd / 0.65),
        proposedSol: ceil500(projectedGlSol / 0.65),
        kpis: computeKPIs(ceil500(projectedGlStd / 0.65), ceil500(projectedGlSol / 0.65)),
      },
    ];

    return items;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasCvs, selectedCVS, currentStdFee, currentSolFee, stdMemberCount, solMemberCount, glStdNum, glSolNum, yoyAccumulated, feeOneYearAgoStd, glStdOneYearAgo, t]);

  const customStdNum = parseFloat(customStd) || 0;
  const customSolNum = parseFloat(customSol) || 0;
  const customKPIs = useMemo(
    () => (customStdNum > 0 || customSolNum > 0 ? computeKPIs(customStdNum, customSolNum) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [customStdNum, customSolNum, stdMemberCount, solMemberCount, glStdNum, glSolNum, selectedCVS, yoyAccumulated, currentStdFee, feeOneYearAgoStd, glStdOneYearAgo]
  );

  if (isLoading) {
    return (
      <div className="space-y-6 animate-fade-in p-4 md:p-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-24" />)}
        </div>
        <Skeleton className="h-48" />
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="space-y-6 animate-fade-in p-4 md:p-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
              <Calculator className="h-7 w-7 text-primary" />
              {t('feeCalculator.title')}
            </h1>
            <p className="text-muted-foreground mt-1">{t('feeCalculator.subtitle')}</p>
          </div>
          <div className="flex items-center gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={exportCvsToExcel}
                  disabled={!monthly.length}
                  className="h-8 w-8"
                >
                  <Download className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Exportar planilla Excel (.xlsx)</TooltipContent>
            </Tooltip>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => refetchCvs()}
              disabled={cvsFetching}
              className="h-8 w-8"
            >
              <RefreshCw className={`h-4 w-4 ${cvsFetching ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>

        {/* Filters row: Month + Quarter side by side */}
        <div className="flex flex-wrap items-end gap-4 -mt-2">
          <div className="flex flex-col gap-1">
            <Label className="text-xs text-muted-foreground">Mes base</Label>
            <Select value={selectedBaseMonth} onValueChange={setSelectedBaseMonth}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Mes base" />
              </SelectTrigger>
              <SelectContent>
                {availableFeeMonths.map((m) => (
                  <SelectItem key={m.value} value={m.value}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

        <div className="flex flex-col gap-1">
            <Label className="text-xs text-muted-foreground">Trimestre CVS</Label>
            {!fetchError && selectedQuarter ? (
              <div className="h-10 flex items-center px-3 rounded-md border border-input bg-muted/50 text-sm w-[260px]">
                {selectedQuarter.quarterLabel} — CVS: <span className="font-semibold ml-1">{formatPct(selectedQuarter.cvs)}</span>
              </div>
            ) : !fetchError && cvsLoading ? (
              <Skeleton className="h-10 w-[260px]" />
            ) : (
              <Input
                type="number"
                step="0.1"
                placeholder="CVS %"
                value={manualCvs}
                onChange={(e) => setManualCvs(e.target.value)}
                className="w-[120px]"
              />
            )}
          </div>

          {fetchError && !cvsLoading && (
            <Tooltip>
              <TooltipTrigger>
                <AlertTriangle className="h-4 w-4 text-warning mb-2.5" />
              </TooltipTrigger>
              <TooltipContent>{t('feeCalculator.fetchError')}</TooltipContent>
            </Tooltip>
          )}
        </div>

        {/* Monthly breakdown & YoY below header */}
        {quarterMonthlyBreakdown && quarterMonthlyBreakdown.length > 0 && (
          <div className="rounded-lg bg-muted/50 px-4 py-2.5 -mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
            {quarterMonthlyBreakdown.map((p) => (
              <span key={p.monthKey}>
                {p.monthLabel}: <span className="font-medium text-foreground">{formatPct(p.variation)}</span>
              </span>
            ))}
            {selectedQuarter && (
              <span className="font-bold text-foreground">
                {selectedQuarter.quarterLabel}: {formatPct(selectedQuarter.cvs)}
              </span>
            )}
            {monthly.length >= 12 && (
              <span>
                Acum. 12m: <span className="font-medium text-foreground">{formatPct(yoyAccumulated)}</span>
              </span>
            )}
          </div>
        )}

        {/* Warning if no fees */}
        {currentStdFee === 0 && (
          <div className="rounded-lg border border-warning/30 bg-warning/10 p-4 text-sm text-warning">
            {t('feeCalculator.noCurrentFees')}
          </div>
        )}

        {/* Section 1 — Current Reference */}
        <div>
          <h2 className="section-header">{t('feeCalculator.currentReference')}</h2>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            <StatCard title={t('feeCalculator.currentStdFee')} value={formatARS(currentStdFee)} />
            <StatCard title={t('feeCalculator.currentSolFee')} value={formatARS(currentSolFee)} />
            <StatCard title={t('feeCalculator.activeStdMembers')} value={stdMemberCount} icon={<Users className="h-5 w-5 text-muted-foreground" />} />
            <StatCard title={t('feeCalculator.activeSolMembers')} value={solMemberCount} icon={<Users className="h-5 w-5 text-muted-foreground" />} />
            <StatCard
              title={t('feeCalculator.glStdFee')}
              value={glStdNum > 0 ? formatARS(glStdNum) : '—'}
              subtitle={glStdNum > 0 && hasCvs ? `Proyectado: ${formatARS(Math.round(glStdNum * (1 + selectedCVS / 100)))}` : undefined}
            />
            <StatCard
              title={t('feeCalculator.glSolFee')}
              value={glSolNum > 0 ? formatARS(glSolNum) : '—'}
              subtitle={glSolNum > 0 && hasCvs ? `Proyectado: ${formatARS(Math.round(glSolNum * (1 + selectedCVS / 100)))}` : undefined}
            />
          </div>
        </div>



        {/* Section 4 — Proposals */}
        <div>
          <h2 className="section-header">{t('feeCalculator.proposals')}</h2>
          {!hasCvs ? (
            <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
              {t('feeCalculator.selectQuarterFirst')}
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2 md:gap-4">
              {proposals.map((p, idx) => (
                <ProposalCard
                  key={idx}
                  name={p.name}
                  badgeColor={p.color}
                  bufferPct={p.buffer}
                  proposedStd={p.proposedStd}
                  proposedSol={p.proposedSol}
                  kpis={p.kpis}
                  t={t}
                  noGlData={noGlData}
                />
              ))}
            </div>
          )}
        </div>

        {/* Section 5 — Custom Scenario */}
        <Card className="border-dashed">
          <CardHeader className="pb-3">
            <Badge variant="outline" className="border-dashed w-fit">
              <Sparkles className="h-3 w-3 mr-1" />
              {t('feeCalculator.custom')}
            </Badge>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>{t('feeCalculator.customStdFee')}</Label>
                <Input type="number" step="1" placeholder="0" value={customStd} onChange={(e) => setCustomStd(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>{t('feeCalculator.customSolFee')}</Label>
                <Input type="number" step="1" placeholder="0" value={customSol} onChange={(e) => setCustomSol(e.target.value)} />
              </div>
            </div>
            <Separator />
            {customKPIs ? (
              <KPIList kpis={customKPIs} t={t} noGlData={noGlData} />
            ) : (
              <div className="text-center text-sm text-muted-foreground py-4">—</div>
            )}
          </CardContent>
        </Card>
      </div>
    </TooltipProvider>
  );
}
