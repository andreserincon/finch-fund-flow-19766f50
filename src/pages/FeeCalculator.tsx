import { useState, useMemo, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Calculator, Users, AlertTriangle, RefreshCw, Download } from 'lucide-react';
import * as XLSX from 'xlsx';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { TermTooltip } from '@/components/ui/TermTooltip';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { StatCard } from '@/components/dashboard/StatCard';
import { PageHeader } from '@/components/ui/PageHeader';
import { useMonthlyFees } from '@/hooks/useMonthlyFees';
import { useMembers } from '@/hooks/useMembers';
import { useCVSIndex, QuarterlyIndex } from '@/hooks/useCVSIndex';
import { useCommittedNumber } from '@/hooks/useCommittedNumber';
import { Skeleton } from '@/components/ui/skeleton';
import { Link } from 'react-router-dom';
import { cn, parseLocalDate, formatPercent } from '@/lib/utils';

const formatARS = (n: number) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);

interface ProposalKPIs {
  totalMonthlyIncome: number;
  // GL-derived figures are null when there is no GL on file for the period.
  glTotalCost: number | null;
  netMonthlyIncome: number | null;
  ourFeeIncrease: number;
  glFeeIncrease: number;
  delta: number | null;
  deltaVsGlYearAgo: number | null;
  yoyFeeVariation: number | null;
  yoyAccumulatedIndex: number;
  projectedGlStd: number | null;
  projectedGlSol: number | null;
}

type ReadMode = 'absolute' | 'delta';

// The stable identity of a scenario is its key, never its array index and never
// its translated name.
type ScenarioKey = 'actual' | 'ratio' | 'base' | 'gl65' | 'custom';

interface Scenario {
  key: ScenarioKey;
  name: string;
  sublabel?: string;
  termKey?: string;
  proposedStd: number;
  proposedSol: number;
  kpis: ProposalKPIs;
}

// The bench reads each column from its scenario kpis plus the two proposed
// cápitas, which live on the Scenario, not in ProposalKPIs.
type CellData = ProposalKPIs & { proposedStd: number; proposedSol: number };

// One descriptor per metric. The same list renders in both modes: mode changes
// only how each row renders its value, never which rows exist, so the row count
// is identical in Valores and Diferencia vs Actual.
interface MetricRow {
  key: string;
  label: string;
  termKey?: string;
  kind: 'currency' | 'percent' | 'ratio'; // ratio = an unsigned level like 54,3%
  get: (k: CellData) => number | null;
  // Label prominence. `headline` = the proposed cápita (the number the treasurer
  // copies); `normal` = a decision row (net income, GL % de cápita); `dim` =
  // supporting evidence. Governs the label weight, not the figure colour.
  emphasis?: 'headline' | 'normal' | 'dim';
  // Scenario-invariant: computeKPIs derives it from the GL cost model or a
  // page-level constant, never from proposedStd/proposedSol, so it is identical
  // in every column. In delta mode it reads "Igual en todas", never a signed zero.
  invariant?: boolean;
  // A GL projected sub-row rendered under a headline row: smaller, muted.
  subRow?: boolean;
  tone?: (v: number) => string; // sign colouring, absolute mode only
}

// The bench body defined ONCE: the single source of truth for what renders and
// for every count. 8 body rows plus 2 GL projected sub-rows = 10 descriptor
// entries per column, identical in both read modes. Parity is asserted against
// this array's length, never a hardcoded integer.
const buildBenchRows = (t: (key: string) => string): MetricRow[] => [
  { key: 'proposedStd', label: t('feeCalculator.proposedStd'), kind: 'currency', get: (k) => k.proposedStd, emphasis: 'headline' },
  { key: 'projectedGlStd', label: 'Cápita GL estándar proyectada', kind: 'currency', get: (k) => k.projectedGlStd, subRow: true, invariant: true },
  { key: 'proposedSol', label: t('feeCalculator.proposedSol'), kind: 'currency', get: (k) => k.proposedSol, emphasis: 'headline' },
  { key: 'projectedGlSol', label: 'Cápita GL solidaria proyectada', kind: 'currency', get: (k) => k.projectedGlSol, subRow: true, invariant: true },
  { key: 'totalMonthlyIncome', label: t('feeCalculator.totalMonthlyIncome'), kind: 'currency', get: (k) => k.totalMonthlyIncome, emphasis: 'dim' },
  { key: 'glTotalCost', label: t('feeCalculator.glTotalCost'), kind: 'currency', get: (k) => k.glTotalCost, emphasis: 'dim', invariant: true },
  { key: 'netMonthlyIncome', label: t('feeCalculator.netMonthlyIncome'), kind: 'currency', get: (k) => k.netMonthlyIncome, emphasis: 'normal', tone: (v) => (v > 0 ? 'text-success' : 'text-overdue') },
  { key: 'ourFeeIncrease', label: t('feeCalculator.ourFeeIncrease'), termKey: 'incrementoPropio', kind: 'percent', get: (k) => k.ourFeeIncrease, emphasis: 'dim' },
  { key: 'delta', label: t('feeCalculator.delta'), termKey: 'glPctCapita', kind: 'ratio', get: (k) => k.delta, emphasis: 'normal' },
  { key: 'yoyFeeVariation', label: t('feeCalculator.yoyFeeVariation'), kind: 'percent', get: (k) => k.yoyFeeVariation, emphasis: 'dim' },
];

const formatAbs = (v: number, kind: MetricRow['kind']): string => {
  if (kind === 'currency') return formatARS(v);
  if (kind === 'percent') return formatPercent(v, { signed: true });
  return formatPercent(v); // ratio: unsigned level
};

const formatDeltaCell = (v: number, kind: MetricRow['kind']): string => {
  if (kind === 'currency') return `${v >= 0 ? '+' : ''}${formatARS(v)}`;
  // A difference of two percentages is expressed in percentage points.
  return formatPercent(v, { signed: true, unit: 'pp' });
};

const toCellData = (s: Scenario): CellData => ({ ...s.kpis, proposedStd: s.proposedStd, proposedSol: s.proposedSol });

// The label class carries prominence without relying on colour alone: normal and
// dim differ in both weight and foreground, so the distinction survives grayscale.
const benchLabelClass = (row: MetricRow): string => {
  if (row.subRow) return 'text-xs text-muted-foreground';
  if (row.emphasis === 'headline') return 'text-sm font-semibold text-foreground';
  if (row.emphasis === 'normal') return 'text-sm font-medium text-foreground';
  return 'text-sm text-muted-foreground';
};

// Every figure is in the JetBrains Mono numeral face with tabular-nums (R9). The
// headline caps at 24px (text-2xl) and never grows on desktop: the five-column
// bench overflows the measured 1073px budget at a 30px headline (D8).
const benchFigureClass = (row: MetricRow): string => {
  if (row.subRow) return 'font-mono tabular-nums text-xs';
  if (row.emphasis === 'headline') return 'font-mono tabular-nums text-2xl font-semibold';
  return 'font-mono tabular-nums text-sm';
};

// One render path, one row list. `mode` changes only how a cell renders, never
// which rows exist. This is the S4a-verified engine, transposed to a table cell.
const renderBenchCell = (
  row: MetricRow,
  colData: CellData,
  opts: { mode: ReadMode; baselineCell: CellData; isBaselineCol: boolean; isEmptyCustom: boolean; nd: string },
): { text: string; className: string } => {
  const muted = 'text-muted-foreground';
  const { mode, baselineCell, isBaselineCol, isEmptyCustom, nd } = opts;
  // A custom column with nothing committed shows a muted placeholder, not a zero.
  if (isEmptyCustom) return { text: 'Sin valor', className: muted };
  const kv = row.get(colData);
  if (mode === 'absolute') {
    if (kv === null) return { text: nd, className: muted };
    if (row.invariant || row.subRow) return { text: formatAbs(kv, row.kind), className: muted };
    return { text: formatAbs(kv, row.kind), className: row.tone ? row.tone(kv) : '' };
  }
  // Diferencia vs Actual
  if (isBaselineCol) return { text: 'Referencia', className: muted };
  if (kv === null) return { text: nd, className: muted };
  if (row.invariant) return { text: 'Igual en todas', className: muted };
  const bv = row.get(baselineCell);
  if (bv === null) return { text: nd, className: muted };
  return { text: formatDeltaCell(kv - bv, row.kind), className: '' };
};

export default function FeeCalculator() {
  const { t } = useTranslation();
  const { monthlyFees, isLoading: feesLoading } = useMonthlyFees();
  const { memberBalances, isLoading: membersLoading } = useMembers();
  const { data: cvsData, isLoading: cvsLoading, refetch: refetchCvs, isFetching: cvsFetching } = useCVSIndex();

  const [selectedBaseMonth, setSelectedBaseMonth] = useState<string>('');
  const [manualCvs, setManualCvs] = useState<string>('');
  const [mode, setMode] = useState<ReadMode>('absolute');
  const customStdField = useCommittedNumber(0);
  const customSolField = useCommittedNumber(0);

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
        ['Índice de Salarios (INDEC): Variación Mensual', null, null],
        [],
        ['Mes', 'Índice (base oct-2016=100)', 'Variación Mensual %'],
        ...monthly.map((p) => [p.monthLabel, p.indexValue, p.variation]),
        [],
        [],
        ['Índice Acumulado Anual (12 meses)', null, yoyAccumulated > 0 ? yoyAccumulated : 'N/D'],
        [],
        ['Fuente: Ministerio de Economía: datos.gob.ar / INDEC', null, null],
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
        ['Resumen Trimestral: CVS Acumulado', null, null, null, null, null],
        [],
        ['Trimestre', 'CVS Trimestral %', 'Mes 1: Variación %', 'Mes 2: Variación %', 'Mes 3: Variación %', '¿Trimestre Seleccionado?'],
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

      // ========== Sheet 3: Propuestas de Cápitas ==========
      const baseMonthLabel = availableFeeMonths.find(m => m.value === selectedBaseMonth)?.label ?? selectedBaseMonth ?? '';
      const quarterLabel = selectedQuarter?.quarterLabel ?? 'Manual';

      // Minimal bridge so the export keeps compiling. S5 rebuilds the workbook
      // to mirror the live column model by construction.
      const lowP = scenarios.find((s) => s.key === 'ratio');
      const baseP = scenarios.find((s) => s.key === 'base');
      const highP = scenarios.find((s) => s.key === 'gl65');
      const getKpiVal = (p: typeof lowP, key: keyof ProposalKPIs) => p ? p.kpis[key] : '-';
      const getCustomVal = (key: keyof ProposalKPIs) => customKPIs ? customKPIs[key] : '-';

      const s3Data: (string | number | null)[][] = [
        ['Propuestas de Cápitas: Calculadora de Cápitas', null, null, null, null, null, null],
        [],
        ['Período Base:', baseMonthLabel],
        ['Trimestre CVS:', quarterLabel],
        ['CVS Aplicado:', selectedCVS],
        ['Índice YoY Acumulado:', yoyAccumulated],
        ['Cápita GL Estándar actual:', glStdNum],
        ['Cápita GL Solidaria actual:', glSolNum],
        ['Miembros Estándar activos:', stdMemberCount],
        ['Miembros Solidaridad activos:', solMemberCount],
        [],
        ['', 'Conservador', 'Base CVS', 'Alto', 'Personalizado'],
        ['Cápita Estándar Propuesta', lowP?.proposedStd ?? '-', baseP?.proposedStd ?? '-', highP?.proposedStd ?? '-', customKPIs ? customStdNum : '-'],
        ['Cápita Solidaria Propuesta', lowP?.proposedSol ?? '-', baseP?.proposedSol ?? '-', highP?.proposedSol ?? '-', customKPIs ? customSolNum : '-'],
        ['GL Estándar Proyectado', getKpiVal(lowP, 'projectedGlStd'), getKpiVal(baseP, 'projectedGlStd'), getKpiVal(highP, 'projectedGlStd'), getCustomVal('projectedGlStd')],
        ['GL Solidaridad Proyectado', getKpiVal(lowP, 'projectedGlSol'), getKpiVal(baseP, 'projectedGlSol'), getKpiVal(highP, 'projectedGlSol'), getCustomVal('projectedGlSol')],
        [],
        ['Ingreso Mensual Total', getKpiVal(lowP, 'totalMonthlyIncome'), getKpiVal(baseP, 'totalMonthlyIncome'), getKpiVal(highP, 'totalMonthlyIncome'), getCustomVal('totalMonthlyIncome')],
        ['Costo Total GL', getKpiVal(lowP, 'glTotalCost'), getKpiVal(baseP, 'glTotalCost'), getKpiVal(highP, 'glTotalCost'), getCustomVal('glTotalCost')],
        ['Ingreso Neto Mensual', getKpiVal(lowP, 'netMonthlyIncome'), getKpiVal(baseP, 'netMonthlyIncome'), getKpiVal(highP, 'netMonthlyIncome'), getCustomVal('netMonthlyIncome')],
        ['Incremento Propio %', getKpiVal(lowP, 'ourFeeIncrease'), getKpiVal(baseP, 'ourFeeIncrease'), getKpiVal(highP, 'ourFeeIncrease'), getCustomVal('ourFeeIncrease')],
        ['GL % de cápita', getKpiVal(lowP, 'delta'), getKpiVal(baseP, 'delta'), getKpiVal(highP, 'delta'), getCustomVal('delta')],
        ['Variación Interanual Cápita %', lowP?.kpis.yoyFeeVariation ?? 'N/D', baseP?.kpis.yoyFeeVariation ?? 'N/D', highP?.kpis.yoyFeeVariation ?? 'N/D', customKPIs?.yoyFeeVariation ?? 'N/D'],
        ['Índice Acumulado YoY (ref.)', getKpiVal(lowP, 'yoyAccumulatedIndex'), getKpiVal(baseP, 'yoyAccumulatedIndex'), getKpiVal(highP, 'yoyAccumulatedIndex'), getCustomVal('yoyAccumulatedIndex')],
      ];
      const ws3 = XLSX.utils.aoa_to_sheet(s3Data);
      ws3['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 6 } }];
      ws3['!cols'] = [{ wch: 32 }, { wch: 20 }, { wch: 20 }, { wch: 20 }, { wch: 20 }];
      if (!ws3['!views']) ws3['!views'] = [{}];
      (ws3['!views'] as any[])[0] = { state: 'frozen', ySplit: 12 };
      XLSX.utils.book_append_sheet(wb, ws3, 'Propuestas de Cápitas');

      // ========== Sheet 4: Mi Calculadora ==========
      const s4Data: (string | number | null | { f: string })[][] = [
        ['Mi Calculadora: Espacio de Trabajo', null, null, null, null, null],
        [],
        ['Usá esta hoja para tus propios cálculos. Los valores en azul son referencias traídas de la calculadora. Podés modificar cualquier celda.'],
        [],
        [],
        ['REFERENCIAS (traídas de la calculadora)'],
        ['CVS Trimestral %', selectedCVS],
        ['Índice YoY Acumulado %', yoyAccumulated],
        ['Cápita Estándar Actual', currentStdFee],
        ['Cápita Solidaria Actual', currentSolFee],
        ['GL Estándar', glStdNum],
        ['GL Solidaridad', glSolNum],
        ['Miembros Estándar', stdMemberCount],
        ['Miembros Solidaridad', solMemberCount],
        [],
        ['MI ESCENARIO'],
        ['Mi Cápita Estándar', null],
        ['Mi Cápita Solidaria', null],
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
      const fileName = `capitas-${selectedBaseMonth?.slice(0, 7) ?? 'calculadora'}-${new Date().toISOString().slice(0, 10)}.xlsx`;
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
          month: capitalize(parseLocalDate(withGl.year_month).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })),
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
      month: capitalize(parseLocalDate(withGl.year_month).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })),
    };
  }, [monthlyFees, selectedBaseMonth]);

  // GL is nullable: null when there is no GL on file for the period. The DB is
  // the only source at this slice; R14 (S7) adds a committed manual GL input as
  // an alternate source via useCommittedNumber.
  const glStdNum: number | null = glFromDb ? glFromDb.standard : null;
  const glSolNum: number | null = glFromDb ? glFromDb.solidarity : null;
  const noGlData = glStdNum === null;

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
    return result;
  }, [quarterly, selectedQuarterId]);

  // Monthly breakdown for selected quarter
  const quarterMonthlyBreakdown = useMemo(() => {
    if (!selectedQuarter) return null;
    const points = monthly.filter((m) => selectedQuarter.months.includes(m.monthKey));
    return points;
  }, [selectedQuarter, monthly]);

  const computeKPIs = (proposedStd: number, proposedSol: number): ProposalKPIs => {
    const totalMonthlyIncome = stdMemberCount * proposedStd + solMemberCount * proposedSol;
    const ourFeeIncrease = currentStdFee > 0 ? ((proposedStd - currentStdFee) / currentStdFee) * 100 : 0;
    const glFeeIncrease = selectedCVS;
    const yoyFeeVariation =
      feeOneYearAgoStd !== null && feeOneYearAgoStd > 0
        ? ((proposedStd - feeOneYearAgoStd) / feeOneYearAgoStd) * 100
        : null;

    const deltaVsGlYearAgo =
      feeOneYearAgoStd !== null && glStdOneYearAgo !== null && feeOneYearAgoStd > 0
        ? (glStdOneYearAgo / feeOneYearAgoStd) * 100
        : null;

    // GL-derived figures. In JS `null * n === 0`, which would launder a missing
    // GL into a silent $ 0, so each is guarded explicitly and stays null when
    // there is no GL on file.
    let projectedGlStd: number | null = null;
    let projectedGlSol: number | null = null;
    let glTotalCost: number | null = null;
    let netMonthlyIncome: number | null = null;
    let delta: number | null = null;
    if (glStdNum !== null) {
      projectedGlStd = Math.round(glStdNum * (1 + selectedCVS / 100));
      projectedGlSol = Math.round((glSolNum ?? 0) * (1 + selectedCVS / 100));
      glTotalCost = projectedGlStd * stdMemberCount + projectedGlSol * solMemberCount;
      netMonthlyIncome = totalMonthlyIncome - glTotalCost;
      delta = proposedStd > 0 ? (projectedGlStd / proposedStd) * 100 : 0;
    }

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

  const scenarios = useMemo<Scenario[]>(() => {
    const round500 = (n: number) => Math.round(n / 500) * 500;
    const ceil500 = (n: number) => Math.ceil(n / 500) * 500;

    // "Actual": the true do-nothing baseline. It holds the cápita flat while GL
    // still rises with CVS (computeKPIs projects GL internally). Every other
    // column's delta is measured against this.
    const actual: Scenario = {
      key: 'actual',
      name: 'Actual',
      proposedStd: currentStdFee,
      proposedSol: currentSolFee,
      kpis: computeKPIs(currentStdFee, currentSolFee),
    };
    // The presets need a CVS; Actual does not. Without a CVS the memo returns
    // just [actual]; the custom column is appended in the render, outside this
    // branch, so the treasurer's own scenario never vanishes.
    if (!hasCvs) return [actual];

    const baseStd = round500(currentStdFee * (1 + selectedCVS / 100));
    const baseSol = round500(currentSolFee * (1 + selectedCVS / 100));
    const projGlStd = glStdNum === null ? null : Math.round(glStdNum * (1 + selectedCVS / 100));
    const projGlSol = glSolNum === null ? null : Math.round(glSolNum * (1 + selectedCVS / 100));
    // "Ratio GL": proposedStd such that GL % of cápita equals GL % of cápita a
    // year ago. Without a GL on file this cannot be derived, so it falls back to
    // the Base cápita rather than to a laundered zero.
    const targetDelta =
      feeOneYearAgoStd !== null && glStdOneYearAgo !== null && feeOneYearAgoStd > 0
        ? (glStdOneYearAgo / feeOneYearAgoStd) * 100
        : null;
    const ratioStd = targetDelta !== null && targetDelta > 0 && projGlStd !== null ? ceil500(projGlStd / (targetDelta / 100)) : baseStd;
    const ratioSol = targetDelta !== null && targetDelta > 0 && projGlSol !== null ? ceil500(projGlSol / (targetDelta / 100)) : baseSol;
    const gl65Std = projGlStd !== null ? ceil500(projGlStd / 0.65) : baseStd;
    const gl65Sol = projGlSol !== null ? ceil500(projGlSol / 0.65) : baseSol;

    const ratio: Scenario = {
      key: 'ratio',
      name: t('feeCalculator.presets.ratio.name'),
      sublabel: t('feeCalculator.presets.ratio.sublabel'),
      termKey: 'ratioGl',
      proposedStd: ratioStd,
      proposedSol: ratioSol,
      kpis: computeKPIs(ratioStd, ratioSol),
    };
    const base: Scenario = {
      key: 'base',
      name: t('feeCalculator.presets.base.name'),
      sublabel: t('feeCalculator.presets.base.sublabel'),
      proposedStd: baseStd,
      proposedSol: baseSol,
      kpis: computeKPIs(baseStd, baseSol),
    };
    const gl65: Scenario = {
      key: 'gl65',
      name: t('feeCalculator.presets.gl65.name'),
      sublabel: t('feeCalculator.presets.gl65.sublabel'),
      termKey: 'gl65',
      proposedStd: gl65Std,
      proposedSol: gl65Sol,
      kpis: computeKPIs(gl65Std, gl65Sol),
    };

    return [actual, ratio, base, gl65];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasCvs, selectedCVS, currentStdFee, currentSolFee, stdMemberCount, solMemberCount, glStdNum, glSolNum, yoyAccumulated, feeOneYearAgoStd, glStdOneYearAgo, t]);

  const customStdNum = customStdField.committed;
  const customSolNum = customSolField.committed;
  const customKPIs = useMemo(
    () => (customStdNum > 0 || customSolNum > 0 ? computeKPIs(customStdNum, customSolNum) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [customStdNum, customSolNum, stdMemberCount, solMemberCount, glStdNum, glSolNum, selectedCVS, yoyAccumulated, currentStdFee, feeOneYearAgoStd, glStdOneYearAgo]
  );

  // Tu escenario is a peer column, not an appendix: it sits OUTSIDE the !hasCvs
  // branch, so it never disappears (regression the board flagged). When nothing
  // is committed its cells read "Sin valor"; the placeholder kpis are never shown.
  const hasCustomValue = customKPIs !== null;
  const customScenario: Scenario = {
    key: 'custom',
    name: 'Tu escenario',
    proposedStd: customStdNum,
    proposedSol: customSolNum,
    kpis: customKPIs ?? scenarios[0].kpis,
  };
  // columns = hasCvs ? [actual, ratio, base, gl65, custom] : [actual, custom].
  // scenarios already branches on hasCvs; custom is appended in both states.
  const columns: Scenario[] = [...scenarios, customScenario];
  const benchRows = buildBenchRows(t);
  const baselineCell = toCellData(scenarios[0]); // Actual, the do-nothing anchor
  const nd = t('feeCalculator.noYoyData');

  // Page-level ratios stated once in the Referencia grid, not per scenario. Both
  // operands are guarded: glStdNum is nullable, and null / x * 100 would render a
  // false 0,0%, the silent zero this build exists to kill.
  const glPctToday = currentStdFee > 0 && glStdNum !== null ? (glStdNum / currentStdFee) * 100 : null;
  const glPctYearAgo =
    feeOneYearAgoStd !== null && glStdOneYearAgo !== null && feeOneYearAgoStd > 0
      ? (glStdOneYearAgo / feeOneYearAgoStd) * 100
      : null;

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
      <div className="space-y-4 md:space-y-6 animate-fade-in p-4 md:p-6">
        {/* Header */}
        <PageHeader
          className="gap-2 md:gap-4"
          title={
            <span className="flex items-center gap-2">
              <Calculator className="h-5 w-5 md:h-7 md:w-7 text-primary" />
              {t('feeCalculator.title')}
            </span>
          }
          titleClassName="text-xl md:text-3xl"
          subtitle={t('feeCalculator.subtitle')}
          hairline
          actions={
            <>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={exportCvsToExcel}
                    disabled={!monthly.length}
                    className="h-8 w-8"
                    data-asistente="calc-exportar"
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
            </>
          }
        />

        {/* Cómo usar: a short primer so a new treasurer knows what this tool
            does and that it never writes anything until a value is copied into
            Cápitas Mensuales. */}
        <div className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-xs md:text-sm text-muted-foreground -mt-2">
          {t('feeCalculator.howToUse')}
        </div>

        {/* Filters row: Month + Quarter side by side */}
        <div className="flex flex-wrap items-end gap-4 -mt-2">
          <div className="flex flex-col gap-1">
            <Label className="text-xs text-muted-foreground">{t('feeCalculator.baseMonthLabel')}</Label>
            <Select value={selectedBaseMonth} onValueChange={setSelectedBaseMonth}>
              <SelectTrigger className="w-[200px]" data-asistente="calc-mes-base">
                <SelectValue placeholder={t('feeCalculator.baseMonthLabel')} />
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

        <div className="flex flex-col gap-1" data-asistente="calc-trimestre-cvs">
            <Label className="text-xs text-muted-foreground">
              Trimestre <TermTooltip termKey="cvs">CVS</TermTooltip>
            </Label>
            {!fetchError && selectedQuarter ? (
              <div className="h-10 flex items-center px-3 rounded-md border border-input bg-muted/50 text-sm w-[260px]">
                {selectedQuarter.quarterLabel}, CVS: <span className="font-semibold ml-1 font-mono tabular-nums">{formatPercent(selectedQuarter.cvs, { signed: true })}</span>
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
                {p.monthLabel}: <span className="font-medium text-foreground font-mono tabular-nums">{formatPercent(p.variation, { signed: true })}</span>
              </span>
            ))}
            {selectedQuarter && (
              <span className="font-bold text-foreground">
                {selectedQuarter.quarterLabel}: <span className="font-mono tabular-nums">{formatPercent(selectedQuarter.cvs, { signed: true })}</span>
              </span>
            )}
            {monthly.length >= 12 && (
              <span>
                Acum. 12m: <span className="font-medium text-foreground font-mono tabular-nums">{formatPercent(yoyAccumulated, { signed: true })}</span>
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

        {/* Section 1: Current Reference */}
        <div data-asistente="calc-referencia-actual">
          <h2 className="section-header">{t('feeCalculator.currentReference')}</h2>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 md:gap-4">
            <StatCard title={t('feeCalculator.currentStdFee')} value={formatARS(currentStdFee)} />
            <StatCard title={t('feeCalculator.currentSolFee')} value={formatARS(currentSolFee)} />
            <StatCard title={t('feeCalculator.activeStdMembers')} value={stdMemberCount} icon={<Users className="h-5 w-5 text-muted-foreground" />} />
            <StatCard title={t('feeCalculator.activeSolMembers')} value={solMemberCount} icon={<Users className="h-5 w-5 text-muted-foreground" />} />
            <StatCard
              title={t('feeCalculator.glStdFee')}
              value={glStdNum !== null && glStdNum > 0 ? formatARS(glStdNum) : '-'}
              subtitle={glStdNum !== null && glStdNum > 0 && hasCvs ? `Proyectado: ${formatARS(Math.round(glStdNum * (1 + selectedCVS / 100)))}` : undefined}
            />
            <StatCard
              title={t('feeCalculator.glSolFee')}
              value={glSolNum !== null && glSolNum > 0 ? formatARS(glSolNum) : '-'}
              subtitle={glSolNum !== null && glSolNum > 0 && hasCvs ? `Proyectado: ${formatARS(Math.round(glSolNum * (1 + selectedCVS / 100)))}` : undefined}
            />
            {/* GL % de cápita stated once, page-level. Both operands guarded: a
                null GL renders N/D, never a false 0,0%. */}
            <StatCard
              title={`${t('feeCalculator.delta')} (hoy)`}
              value={glPctToday !== null ? formatPercent(glPctToday) : nd}
            />
            <StatCard
              title={t('feeCalculator.deltaVsGlYearAgo')}
              value={glPctYearAgo !== null ? formatPercent(glPctYearAgo) : nd}
            />
          </div>
        </div>



        {/* Section 4: Proposals */}
        <div data-asistente="calc-propuestas">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="section-header">{t('feeCalculator.proposals')}</h2>
            <div
              role="group"
              aria-label="Modo de lectura de las cifras"
              className="inline-flex overflow-hidden rounded-md border border-border text-xs"
            >
              <button
                type="button"
                aria-pressed={mode === 'absolute'}
                onClick={() => setMode('absolute')}
                className={`px-3 py-1.5 transition-colors ${mode === 'absolute' ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:text-foreground'}`}
              >
                {t('feeCalculator.absoluteModeLabel')}
              </button>
              <button
                type="button"
                aria-pressed={mode === 'delta'}
                onClick={() => setMode('delta')}
                className={`border-l border-border px-3 py-1.5 transition-colors ${mode === 'delta' ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:text-foreground'}`}
              >
                {t('feeCalculator.deltaModeLabel')}
              </button>
            </div>
          </div>
          {noGlData && mode === 'absolute' && (
            <p className="mt-2 text-xs text-muted-foreground italic">{t('feeCalculator.enterGlFees')}</p>
          )}

          {/* The bench: metrics down the left, scenarios across as columns. The
              table scrolls horizontally inside its own container while the page
              body never scrolls sideways. min-width 920px is the measured budget
              (D8); the table is w-full so at desktop it simply fills 1073px. */}
          <div className="mt-3 rounded-lg border border-border bg-card overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse" style={{ minWidth: '920px' }}>
                <thead>
                  <tr>
                    <th scope="col" className="text-left align-top p-3 bg-muted/40 border-b border-border">
                      <span className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">Métrica</span>
                    </th>
                    {columns.map((col) => {
                      const isCustom = col.key === 'custom';
                      const subtext = col.sublabel ?? (col.key === 'actual' ? 'Si no cambiás nada.' : undefined);
                      return (
                        <th
                          key={col.key}
                          scope="col"
                          className={cn(
                            'text-left align-top p-3 bg-muted/40 border-b border-border min-w-[9rem]',
                            isCustom && 'bg-accent/50',
                          )}
                        >
                          {isCustom ? (
                            <div className="flex flex-col gap-2">
                              {/* A real h2 so the section enters the heading
                                  outline; the peer column carries no border
                                  decoration, no glyph, no pill. */}
                              <h2 className="section-header mb-0 text-base">{col.name}</h2>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                <div className="flex flex-col gap-1">
                                  <Label htmlFor="custom-std" className="text-[11px] text-muted-foreground">Estándar</Label>
                                  <Input
                                    id="custom-std"
                                    type="number"
                                    step="1"
                                    inputMode="numeric"
                                    placeholder="0"
                                    className={cn('h-8 text-right font-mono tabular-nums text-xs', customStdField.pending && 'border-warning')}
                                    {...customStdField.inputProps}
                                    data-asistente="calc-escenario-personalizado"
                                  />
                                </div>
                                <div className="flex flex-col gap-1">
                                  <Label htmlFor="custom-sol" className="text-[11px] text-muted-foreground">Solidaria</Label>
                                  <Input
                                    id="custom-sol"
                                    type="number"
                                    step="1"
                                    inputMode="numeric"
                                    placeholder="0"
                                    className={cn('h-8 text-right font-mono tabular-nums text-xs', customSolField.pending && 'border-warning')}
                                    {...customSolField.inputProps}
                                  />
                                </div>
                              </div>
                              {/* Reserved-height hint so committing never injects layout. */}
                              <p className="min-h-[2rem] text-[11px] leading-snug text-muted-foreground font-normal">
                                {hasCustomValue
                                  ? customStdField.pending || customSolField.pending
                                    ? t('feeCalculator.customPending')
                                    : t('feeCalculator.customCommitted')
                                  : 'Ingresá una cápita estándar o solidaria para ver cómo queda tu escenario frente a las propuestas.'}
                              </p>
                            </div>
                          ) : (
                            <div className="flex flex-col gap-1.5">
                              <Badge variant="secondary" className="w-fit text-xs font-medium">
                                {col.termKey ? (
                                  <TermTooltip termKey={col.termKey} className="decoration-current/40">
                                    {col.name}
                                  </TermTooltip>
                                ) : (
                                  col.name
                                )}
                              </Badge>
                              {subtext && (
                                <span className="text-[11px] leading-snug text-muted-foreground font-normal max-w-[15rem]">
                                  {subtext}
                                </span>
                              )}
                            </div>
                          )}
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {benchRows.map((row) => (
                    <tr key={row.key} className="border-b border-border/60">
                      <th scope="row" className="text-left align-middle font-normal p-3">
                        {row.termKey ? (
                          <TermTooltip termKey={row.termKey} className={cn(benchLabelClass(row), 'mr-1')}>
                            {row.label}
                          </TermTooltip>
                        ) : (
                          <span className={cn(benchLabelClass(row), 'mr-1')}>{row.label}</span>
                        )}
                      </th>
                      {columns.map((col) => {
                        const cell = renderBenchCell(row, toCellData(col), {
                          mode,
                          baselineCell,
                          isBaselineCol: col.key === 'actual',
                          isEmptyCustom: col.key === 'custom' && !hasCustomValue,
                          nd,
                        });
                        return (
                          <td
                            key={col.key}
                            className={cn(
                              'text-right whitespace-nowrap align-middle p-3',
                              benchFigureClass(row),
                              cell.className,
                              col.key === 'custom' && 'bg-accent/20',
                            )}
                          >
                            {cell.text}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* Estimates-only footnote: everything on the bench is a projection. */}
            <div className="flex items-start gap-2 p-3 bg-muted/30 text-xs text-muted-foreground leading-relaxed">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5 opacity-70" aria-hidden="true" />
              <span>
                Todas las cifras son estimaciones. Surgen de proyectar los valores del período base contra el CVS del trimestre y no comprometen a nadie. La calculadora no escribe nada: para aplicar una propuesta, copiá el valor a mano en Cápitas Mensuales.
              </span>
            </div>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
