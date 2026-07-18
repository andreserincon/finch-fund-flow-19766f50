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

// es-AR day-month-year for the provenance line (R13.b). Long month so the string
// is deterministic across engines and reads plainly: "18 de julio de 2026".
const formatFecha = (ms: number) =>
  new Date(ms).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' });

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

// R13.a provenance vocabulary: where a figure came from. The union member IS the
// rendered chip label; there is no translation layer, so a chip can never fall
// out of sync with the value it attributes.
type Source = 'INDEC' | 'Cápitas Mensuales' | 'Miembros' | 'Derivado' | 'A mano';
// Whether the CVS was hand-typed and whether the GL came from R14's manual input,
// so INDEC-sourced rows can flip to 'A mano' when the number was typed from memory.
type SourceCtx = { cvsIsManual: boolean; glIsManual: boolean };

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
  // R13.a: where the row's number came from. A plain array for fixed provenance,
  // or a function so an INDEC / GL row can flip to 'A mano' when the CVS or the GL
  // was hand-typed. Costo total GL carries two sources (INDEC + Miembros).
  source: Source[] | ((ctx: SourceCtx) => Source[]);
}

// The bench body defined ONCE: the single source of truth for what renders and
// for every count. 8 body rows plus 2 GL projected sub-rows = 10 descriptor
// entries per column, identical in both read modes. Parity is asserted against
// this array's length, never a hardcoded integer.
// GL projected sub-rows are INDEC-sourced, but flip to 'A mano' when the CVS was
// hand-typed or R14's manual GL is in play: the projection is only as trustworthy
// as its inputs.
const glProjectedSource = (ctx: SourceCtx): Source[] => [ctx.cvsIsManual || ctx.glIsManual ? 'A mano' : 'INDEC'];

const buildBenchRows = (t: (key: string) => string): MetricRow[] => [
  { key: 'proposedStd', label: t('feeCalculator.proposedStd'), kind: 'currency', get: (k) => k.proposedStd, emphasis: 'headline', source: ['Derivado'] },
  { key: 'projectedGlStd', label: 'Cápita GL estándar proyectada', kind: 'currency', get: (k) => k.projectedGlStd, subRow: true, invariant: true, source: glProjectedSource },
  { key: 'proposedSol', label: t('feeCalculator.proposedSol'), kind: 'currency', get: (k) => k.proposedSol, emphasis: 'headline', source: ['Derivado'] },
  { key: 'projectedGlSol', label: 'Cápita GL solidaria proyectada', kind: 'currency', get: (k) => k.projectedGlSol, subRow: true, invariant: true, source: glProjectedSource },
  { key: 'totalMonthlyIncome', label: t('feeCalculator.totalMonthlyIncome'), kind: 'currency', get: (k) => k.totalMonthlyIncome, emphasis: 'dim', source: ['Miembros'] },
  { key: 'glTotalCost', label: t('feeCalculator.glTotalCost'), kind: 'currency', get: (k) => k.glTotalCost, emphasis: 'dim', invariant: true, source: (ctx) => [ctx.cvsIsManual || ctx.glIsManual ? 'A mano' : 'INDEC', 'Miembros'] },
  { key: 'netMonthlyIncome', label: t('feeCalculator.netMonthlyIncome'), kind: 'currency', get: (k) => k.netMonthlyIncome, emphasis: 'normal', tone: (v) => (v > 0 ? 'text-success' : 'text-overdue'), source: ['Derivado'] },
  { key: 'ourFeeIncrease', label: t('feeCalculator.ourFeeIncrease'), termKey: 'incrementoPropio', kind: 'percent', get: (k) => k.ourFeeIncrease, emphasis: 'dim', source: ['Cápitas Mensuales'] },
  { key: 'delta', label: t('feeCalculator.delta'), termKey: 'glPctCapita', kind: 'ratio', get: (k) => k.delta, emphasis: 'normal', source: ['Derivado'] },
  { key: 'yoyFeeVariation', label: t('feeCalculator.yoyFeeVariation'), kind: 'percent', get: (k) => k.yoyFeeVariation, emphasis: 'dim', source: ['Cápitas Mensuales'] },
];

// R13.a: resolve a row's source to an array of chips, and paint each chip. INDEC
// is tinted --info and 'A mano' is tinted --warning; the rest are neutral. These
// are the only two uses of the status palette this screen introduces, and both
// are provenance, not judgement. Each chip is width-bounded (text-[10px] mono,
// max-width, truncate-with-title) so it never widens the frozen bench label
// column: two chips on one row wrap within the column rather than growing it.
const resolveSource = (source: MetricRow['source'], ctx: SourceCtx): Source[] =>
  typeof source === 'function' ? source(ctx) : source;

const sourceChipClass = (s: Source): string => {
  const base =
    'inline-block max-w-[7rem] truncate rounded-[3px] border px-1 font-mono text-[10px] font-medium uppercase leading-tight tracking-wider';
  if (s === 'INDEC') return cn(base, 'border-info/40 text-info');
  if (s === 'A mano') return cn(base, 'border-warning/50 bg-warning/10 text-warning');
  return cn(base, 'border-border text-muted-foreground');
};

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

// The skeleton bench is the SAME table driven by a loading flag: each figure is
// swapped for a Skeleton sized to the text's own box, so the row heights match
// the loaded bench and the content does not jump on arrival (R12). The headline
// box is the text-2xl line height (h-8), so the two headline rows do not shift.
const skeletonFigureClass = (row: MetricRow): string => {
  if (row.subRow) return 'h-3.5 w-16';
  if (row.emphasis === 'headline') return 'h-8 w-24';
  return 'h-4 w-20';
};

// The skeleton bench always mirrors state 4 (five columns): hasCvs is the normal
// outcome, so reflowing 5 to 2 on the error paths beats reflowing 2 to 5 on every
// healthy load (R12). The keys drive the header shape; the figures are masked.
const SKELETON_COLUMN_KEYS: ScenarioKey[] = ['actual', 'ratio', 'base', 'gl65', 'custom'];

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
  // dataUpdatedAt is when OUR fetch last succeeded (R13.b); the hook returns the
  // raw useQuery result, so it is available here with no hook change.
  const { data: cvsData, isLoading: cvsLoading, refetch: refetchCvs, isFetching: cvsFetching, dataUpdatedAt } = useCVSIndex();

  const [selectedBaseMonth, setSelectedBaseMonth] = useState<string>('');
  const [manualCvs, setManualCvs] = useState<string>('');
  const [mode, setMode] = useState<ReadMode>('absolute');
  const customStdField = useCommittedNumber(0);
  const customSolField = useCommittedNumber(0);
  // R14: the two GL reference tiles become committed-number inputs when there is
  // no GL on file. Same hook as the custom column, so the blur/Enter/clamp/pending
  // contract is not reimplemented.
  const manualGlStdField = useCommittedNumber(0);
  const manualGlSolField = useCommittedNumber(0);

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
        // R13.d: the source cell can never credit INDEC for a hand-typed figure.
        [cvsIsManual ? 'Fuente: CVS ingresado a mano por el tesorero. No verificado contra INDEC.' : 'Fuente: Ministerio de Economía: datos.gob.ar / INDEC', null, null],
        ['Para insertar gráfico: seleccioná las columnas A y C → Insertar → Gráfico de líneas', null, null],
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

      // Sheet 3 mirrors the live bench by construction: the header and every data
      // row are built by mapping the same `columns` array the screen renders, so
      // no column can carry another scenario's numbers under the wrong heading.
      // A custom column with nothing committed emits '-' per cell; a null KPI
      // (no GL on file) emits 'N/D', never a laundered 0.
      const s3Cell = (c: Scenario, value: number | null): string | number =>
        c.key === 'custom' && !hasCustomValue ? '-' : (value ?? 'N/D');

      // R13.d: a Fuente cell per column, so the sheet declares where each column's
      // numbers came from and never lets a hand-typed CVS pass as INDEC.
      const s3Fuente = (c: Scenario): string => {
        if (c.key === 'actual') return 'Cápitas Mensuales (período base)';
        if (c.key === 'custom') return 'Ingresado por el tesorero';
        return cvsIsManual ? 'CVS ingresado a mano. No verificado contra INDEC.' : 'INDEC: Índice de Salarios';
      };

      const s3Preamble: (string | number | null)[][] = [
        ['Propuestas de Cápitas: Calculadora de Cápitas'],
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
      ];
      // The header immediately follows the preamble; the index is derived so the
      // merge, frozen split and column widths track any preamble change.
      const s3HeaderRowIndex = s3Preamble.length;
      const s3Data: (string | number | null)[][] = [
        ...s3Preamble,
        ['', ...columns.map((c) => c.name)],
        ['Fuente', ...columns.map((c) => s3Fuente(c))],
        ['Cápita estándar propuesta', ...columns.map((c) => s3Cell(c, c.proposedStd))],
        ['Cápita solidaria propuesta', ...columns.map((c) => s3Cell(c, c.proposedSol))],
        ['GL estándar proyectado', ...columns.map((c) => s3Cell(c, c.kpis.projectedGlStd))],
        ['GL solidaria proyectado', ...columns.map((c) => s3Cell(c, c.kpis.projectedGlSol))],
        [],
        ['Ingreso mensual total', ...columns.map((c) => s3Cell(c, c.kpis.totalMonthlyIncome))],
        ['Costo total GL', ...columns.map((c) => s3Cell(c, c.kpis.glTotalCost))],
        ['Ingreso neto mensual', ...columns.map((c) => s3Cell(c, c.kpis.netMonthlyIncome))],
        ['Incremento propio %', ...columns.map((c) => s3Cell(c, c.kpis.ourFeeIncrease))],
        ['GL % de cápita', ...columns.map((c) => s3Cell(c, c.kpis.delta))],
        ['Variación interanual cápita %', ...columns.map((c) => s3Cell(c, c.kpis.yoyFeeVariation))],
        ['Índice acumulado YoY ref', ...columns.map((c) => s3Cell(c, c.kpis.yoyAccumulatedIndex))],
      ];
      const ws3 = XLSX.utils.aoa_to_sheet(s3Data);
      ws3['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: columns.length } }];
      ws3['!cols'] = [{ wch: 32 }, ...columns.map(() => ({ wch: 20 }))];
      if (!ws3['!views']) ws3['!views'] = [{}];
      (ws3['!views'] as any[])[0] = { state: 'frozen', ySplit: s3HeaderRowIndex + 1 };
      XLSX.utils.book_append_sheet(wb, ws3, 'Propuestas de Cápitas');

      // ========== Sheet 4: Mi Calculadora ==========
      // GL is scenario-invariant, so Actual's already-rounded projected GL is the
      // value the bench shows in every column. Costo GL Total is re-based onto it
      // (projected GL x members), matching the bench's glTotalCost exactly. When
      // there is no GL on file, glStdNum is null: the GL rows, the projected rows,
      // Costo GL Total and Ingreso Neto Mensual export 'N/D' (static text), never
      // a formula that would evaluate to #VALUE! or a laundered 0.
      const glMissing = glStdNum === null;
      const projGlStdRef = scenarios[0].kpis.projectedGlStd;
      const projGlSolRef = scenarios[0].kpis.projectedGlSol;
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
        ['GL Estándar', glMissing ? 'N/D' : glStdNum],
        ['GL Solidaridad', glMissing ? 'N/D' : glSolNum],
        ['GL Estándar Proyectado', glMissing ? 'N/D' : projGlStdRef],
        ['GL Solidaridad Proyectado', glMissing ? 'N/D' : projGlSolRef],
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

      // Named 1-based cell-row map, derived from the construction above. Every
      // formula interpolates from R and no B-literal is hand-written, so inserting
      // a reference row (the two projected-GL rows this slice adds) cannot silently
      // corrupt a formula. The reference rows are fixed by the literal above; the
      // auto-calc and comparison rows follow from formulaStartRow.
      const formulaStartRow = s4Data.length; // 0-based index of the first auto-calc row
      const R = {
        cvs: 7,
        yoy: 8,
        feeStd: 9,
        feeSol: 10,
        glStd: 11,
        glSol: 12,
        glStdProj: 13,
        glSolProj: 14,
        memStd: 15,
        memSol: 16,
        myFeeStd: 19,
        myFeeSol: 20,
        incStd: formulaStartRow + 1,
        incSol: formulaStartRow + 2,
        incTotal: formulaStartRow + 3,
        costGl: formulaStartRow + 4,
        netIncome: formulaStartRow + 5,
        incPropio: formulaStartRow + 9,
        incCvs: formulaStartRow + 10,
        diffPp: formulaStartRow + 11,
      };

      // Auto-calc rows. Costo GL Total is projected GL x members (the bench basis),
      // and Ingreso Neto reads it. Both are static 'N/D' when GL is missing so the
      // workbook never carries a #VALUE! or a zero for an absent figure.
      const formulaRows: { label: string; formula: string | null }[] = [
        { label: 'Ingreso Mensual Estándar', formula: `B${R.memStd}*B${R.myFeeStd}` },
        { label: 'Ingreso Mensual Solidaridad', formula: `B${R.memSol}*B${R.myFeeSol}` },
        { label: 'Ingreso Total Mensual', formula: `B${R.incStd}+B${R.incSol}` },
        { label: 'Costo GL Total', formula: glMissing ? null : `(B${R.glStdProj}*B${R.memStd})+(B${R.glSolProj}*B${R.memSol})` },
        { label: 'Ingreso Neto Mensual', formula: glMissing ? null : `B${R.incTotal}-B${R.costGl}` },
      ];
      formulaRows.forEach(({ label, formula }, i) => {
        const r = formulaStartRow + i;
        XLSX.utils.sheet_add_aoa(ws4, [[label]], { origin: { r, c: 0 } });
        const cellRef = XLSX.utils.encode_cell({ r, c: 1 });
        if (formula === null) {
          ws4[cellRef] = { t: 's', v: 'N/D' };
        } else {
          ws4[cellRef] = { f: formula, t: 'n' };
        }
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
      // Formulas interpolated from R (1-based cell rows); the write position is R - 1
      // because encode_cell takes a 0-based row.
      ws4[XLSX.utils.encode_cell({ r: R.incPropio - 1, c: 1 })] = { f: `IF(B${R.feeStd}>0,(B${R.myFeeStd}-B${R.feeStd})/B${R.feeStd}*100,0)`, t: 'n' };
      ws4[XLSX.utils.encode_cell({ r: R.incCvs - 1, c: 1 })] = { f: `B${R.cvs}`, t: 'n' };
      ws4[XLSX.utils.encode_cell({ r: R.diffPp - 1, c: 1 })] = { f: `B${R.incPropio}-B${R.incCvs}`, t: 'n' };

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

  // GL is nullable: null when there is no GL on file for the period. The second
  // source (R14) is the treasurer's committed manual value; an empty field (or a
  // clamped-to-zero one) stays null so no KPI computes off a silent zero.
  const glStdNum: number | null = glFromDb ? glFromDb.standard : manualGlStdField.committed > 0 ? manualGlStdField.committed : null;
  const glSolNum: number | null = glFromDb ? glFromDb.solidarity : manualGlSolField.committed > 0 ? manualGlSolField.committed : null;
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
  // Provenance context (R13.a): the CVS is hand-typed when it did not come from a
  // fetched quarter; the GL is hand-typed when there is no row on file and the
  // treasurer committed a manual value. Both flip INDEC-sourced rows to 'A mano'.
  const cvsIsManual = hasCvs && !selectedQuarter;
  const glIsManual = glFromDb === null && glStdNum !== null;
  const sourceCtx: SourceCtx = { cvsIsManual, glIsManual };
  // The manual CVS input shows when the fetch failed or no quarter resolved (and
  // we are not still loading). Its label reads a percentage prompt, not a quarter
  // prompt (R13.f), and the fetch error renders as visible text below it (R13.e).
  const showManualCvsInput = fetchError || (!selectedQuarter && !cvsLoading);

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

  // The five gated states, in order (R11). State 0 (isLoading) skeletons the tiles
  // AND the bench; state 1 (cvsLoading, tiles resolved) skeletons the bench only.
  // The skeleton bench always renders the five state-4 columns; the live two-column
  // bench appears with a message above it in the no-CVS states 2 and 3.
  const benchLoading = isLoading || cvsLoading;
  const benchColumns: Scenario[] = benchLoading
    ? SKELETON_COLUMN_KEYS.map((key) => ({ key, name: '', proposedStd: 0, proposedSol: 0, kpis: scenarios[0].kpis }))
    : columns;
  // State 2: the fetch failed, so the treasurer types a CVS. State 3: the derived
  // quarter is not in the data, so the fix is a different Mes base. Both render the
  // message ABOVE a reduced two-column bench, never in place of it.
  const showEnterCvs = !benchLoading && fetchError && !hasCvs;
  const showNoCvsForQuarter = !benchLoading && !fetchError && !hasCvs;

  // Page-level ratios stated once in the Referencia grid, not per scenario. Both
  // operands are guarded: glStdNum is nullable, and null / x * 100 would render a
  // false 0,0%, the silent zero this build exists to kill.
  const glPctToday = currentStdFee > 0 && glStdNum !== null ? (glStdNum / currentStdFee) * 100 : null;
  const glPctYearAgo =
    feeOneYearAgoStd !== null && glStdOneYearAgo !== null && feeOneYearAgoStd > 0
      ? (glStdOneYearAgo / feeOneYearAgoStd) * 100
      : null;

  return (
    <TooltipProvider>
      <div className="space-y-4 md:space-y-6 p-4 md:p-6">
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
              {showManualCvsInput ? t('feeCalculator.cvsManualLabel') : t('feeCalculator.cvsQuarterLabel')}
            </Label>
            {!fetchError && selectedQuarter ? (
              <div className="h-10 flex items-center px-3 rounded-md border border-input bg-muted/50 text-sm w-[260px]">
                {selectedQuarter.quarterLabel}, CVS: <span className="font-semibold ml-1 font-mono tabular-nums">{formatPercent(selectedQuarter.cvs, { signed: true })}</span>
              </div>
            ) : !fetchError && cvsLoading ? (
              <Skeleton className="h-10 w-[260px]" />
            ) : (
              <>
                <Input
                  type="number"
                  step="0.1"
                  placeholder="CVS %"
                  value={manualCvs}
                  onChange={(e) => setManualCvs(e.target.value)}
                  className="w-[120px]"
                />
                {/* R13.e: the error is visible text, not only a tooltip. */}
                {fetchError && (
                  <p className="mt-1 max-w-[16rem] text-[11px] leading-snug text-warning">
                    {t('feeCalculator.fetchError')}
                  </p>
                )}
              </>
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

        {/* R13.b: the source-and-as-of line, always rendered with a reserved
            height (min-h-[1.125rem]) so its skeleton-to-text resolution never
            injects layout and nothing below jumps. Live path names INDEC and the
            date OUR fetch succeeded ("consultado el"); the manual path attributes
            the figure to the treasurer. The banned freshness verb never appears
            here: it would credit INDEC with the timing of our cache, not of their
            publication. */}
        <div className="-mt-2 flex min-h-[1.125rem] flex-wrap items-center gap-2 font-mono text-[11px] leading-snug text-muted-foreground">
          {cvsLoading ? (
            <Skeleton className="h-3 w-56 motion-reduce:animate-none" />
          ) : cvsIsManual ? (
            <>
              <span className={sourceChipClass('A mano')} title="A mano">A mano</span>
              <span>{t('feeCalculator.cvsProvenanceManual', { fecha: formatFecha(Date.now()) })}</span>
            </>
          ) : dataUpdatedAt ? (
            <>
              <span className={sourceChipClass('INDEC')} title="INDEC">INDEC</span>
              <span>{t('feeCalculator.cvsProvenanceLive', { fecha: formatFecha(dataUpdatedAt) })}</span>
            </>
          ) : null}
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

        {/* Warning if no fees (never while the fees query is still loading) */}
        {!isLoading && currentStdFee === 0 && (
          <div className="rounded-lg border border-warning/30 bg-warning/10 p-4 text-sm text-warning">
            {t('feeCalculator.noCurrentFees')}
          </div>
        )}

        {/* Section 1: Current Reference */}
        <div data-asistente="calc-referencia-actual">
          <h2 className="section-header">{t('feeCalculator.currentReference')}</h2>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 md:gap-4">
            {isLoading ? (
              // State 0: the tile data has not resolved, so the eight reference
              // tiles are skeletons in the exact loaded grid (same count, same ramp).
              Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-24 motion-reduce:animate-none" />
              ))
            ) : (
              <>
                <StatCard title={t('feeCalculator.currentStdFee')} value={formatARS(currentStdFee)} />
                <StatCard title={t('feeCalculator.currentSolFee')} value={formatARS(currentSolFee)} />
                <StatCard title={t('feeCalculator.activeStdMembers')} value={stdMemberCount} icon={<Users className="h-5 w-5 text-muted-foreground" />} />
                <StatCard title={t('feeCalculator.activeSolMembers')} value={solMemberCount} icon={<Users className="h-5 w-5 text-muted-foreground" />} />
                {/* R14: when there is no GL on file the two GL tiles become
                    committed-number inputs (same hook as the custom column) so the
                    instruction "Ingresá las cápitas GL" finally names a control
                    that exists. The tile is warning-tinted and carries an 'A mano'
                    chip; nothing computes until the value is committed, and an
                    empty field keeps glStdNum null so no KPI reads a silent zero. */}
                {glFromDb === null ? (
                  <>
                    <div className="stat-card border-warning/30 bg-warning/10">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <p className="stat-label text-xs md:text-sm">{t('feeCalculator.glStdFee')}</p>
                        <span className={sourceChipClass('A mano')} title="A mano">A mano</span>
                      </div>
                      <Input
                        type="number"
                        step="1"
                        inputMode="numeric"
                        placeholder="0"
                        aria-label={t('feeCalculator.glStdFee')}
                        className={cn('mt-1 h-9 text-right font-mono tabular-nums', manualGlStdField.pending && 'border-warning')}
                        {...manualGlStdField.inputProps}
                        data-asistente="calc-gl-manual-std"
                      />
                      <p className="mt-1 text-xs md:text-sm text-muted-foreground">{t('feeCalculator.glManualSubtitle')}</p>
                    </div>
                    <div className="stat-card border-warning/30 bg-warning/10">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <p className="stat-label text-xs md:text-sm">{t('feeCalculator.glSolFee')}</p>
                        <span className={sourceChipClass('A mano')} title="A mano">A mano</span>
                      </div>
                      <Input
                        type="number"
                        step="1"
                        inputMode="numeric"
                        placeholder="0"
                        aria-label={t('feeCalculator.glSolFee')}
                        className={cn('mt-1 h-9 text-right font-mono tabular-nums', manualGlSolField.pending && 'border-warning')}
                        {...manualGlSolField.inputProps}
                      />
                      <p className="mt-1 text-xs md:text-sm text-muted-foreground">{t('feeCalculator.glManualSubtitle')}</p>
                    </div>
                  </>
                ) : (
                  <>
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
                  </>
                )}
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
              </>
            )}
          </div>
        </div>



        {/* Section 4: Proposals */}
        <div data-asistente="calc-propuestas">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="section-header mb-0">{t('feeCalculator.proposals')}</h2>
              {/* R13.c: a persistent amber marker, not a transient icon, so the
                  hand-typed provenance stays visible while the treasurer reads the
                  bench the CVS produced. */}
              {fetchError && cvsIsManual && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-warning/45 bg-warning/10 px-2 py-0.5 text-[11px] font-medium text-warning">
                  <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden="true" />
                  {t('feeCalculator.manualCvsMarker')}
                </span>
              )}
            </div>
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
          {!benchLoading && noGlData && mode === 'absolute' && (
            <p className="mt-2 text-xs text-muted-foreground italic">{t('feeCalculator.enterGlFees')}</p>
          )}

          {/* States 2 and 3: the message renders ABOVE the two-column bench, never
              in place of it. Actual and Tu escenario still render below. */}
          {showEnterCvs && (
            <p className="mt-3 rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
              {t('feeCalculator.enterCvsFirst')}
            </p>
          )}
          {showNoCvsForQuarter && (
            <p className="mt-3 rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
              {t('feeCalculator.noCvsForQuarter')}
            </p>
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
                    {benchColumns.map((col) => {
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
                          {benchLoading ? (
                            isCustom ? (
                              // Reserves the tallest header cell's height (h2 + two
                              // inputs + hint) so the row does not shift on arrival.
                              <div className="flex flex-col gap-2">
                                <Skeleton className="h-6 w-24 motion-reduce:animate-none" />
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                  <Skeleton className="h-8 motion-reduce:animate-none" />
                                  <Skeleton className="h-8 motion-reduce:animate-none" />
                                </div>
                                <Skeleton className="h-8 w-full motion-reduce:animate-none" />
                              </div>
                            ) : (
                              <div className="flex flex-col gap-1.5">
                                <Skeleton className="h-5 w-20 motion-reduce:animate-none" />
                                <Skeleton className="h-3 w-32 motion-reduce:animate-none" />
                              </div>
                            )
                          ) : isCustom ? (
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
                        {/* Label + provenance chips (R13.a). flex-wrap lets the
                            chips fall below the label under width pressure, so a
                            two-chip row wraps within the column instead of widening
                            the frozen bench (each chip is width-bounded). */}
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          {row.termKey ? (
                            <TermTooltip termKey={row.termKey} className={benchLabelClass(row)}>
                              {row.label}
                            </TermTooltip>
                          ) : (
                            <span className={benchLabelClass(row)}>{row.label}</span>
                          )}
                          {resolveSource(row.source, sourceCtx).map((s) => (
                            <span key={s} className={sourceChipClass(s)} title={s}>
                              {s}
                            </span>
                          ))}
                        </div>
                      </th>
                      {benchColumns.map((col) => {
                        if (benchLoading) {
                          // Each figure is swapped for a Skeleton at the text's own
                          // box height (headline rows keep the text-2xl line box).
                          return (
                            <td
                              key={col.key}
                              className={cn(
                                'text-right whitespace-nowrap align-middle p-3',
                                col.key === 'custom' && 'bg-accent/20',
                              )}
                            >
                              <Skeleton className={cn('ml-auto motion-reduce:animate-none', skeletonFigureClass(row))} />
                            </td>
                          );
                        }
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
            {/* Estimates-only footnote: everything on the bench is a projection.
                Hidden while the bench is a skeleton so no words appear on load. */}
            {!benchLoading && (
              <div className="flex items-start gap-2 p-3 bg-muted/30 text-xs text-muted-foreground leading-relaxed">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5 opacity-70" aria-hidden="true" />
                <span>
                  Todas las cifras son estimaciones. Surgen de proyectar los valores del período base contra el CVS del trimestre y no comprometen a nadie. La calculadora no escribe nada: para aplicar una propuesta, copiá el valor a mano en Cápitas Mensuales.
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
