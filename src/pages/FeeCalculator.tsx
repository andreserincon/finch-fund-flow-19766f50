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
import { parseLocalDate } from '@/lib/utils';

const formatARS = (n: number) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);

const formatPct = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`;

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

// One descriptor per metric. The same list renders in both modes: mode changes
// only how each row renders its value, never which rows exist, so the row count
// is identical in Valores and Diferencia vs Actual.
interface MetricRow {
  key: string;
  label: string;
  termKey?: string;
  kind: 'currency' | 'percent' | 'ratio'; // ratio = an unsigned level like 54,3%
  get: (k: ProposalKPIs) => number | null;
  // Scenario-invariant: computeKPIs derives it from the GL cost model or a
  // page-level constant, never from proposedStd/proposedSol, so it is identical
  // in every column. In delta mode it reads "Igual en todas", never a signed zero.
  invariant?: boolean;
  dim?: boolean; // a muted reference row
  tone?: (v: number) => string; // sign colouring, absolute mode only
}

function KPIList({
  kpis,
  baselineKpis,
  mode,
  isBaseline,
  t,
  noGlData,
}: {
  kpis: ProposalKPIs;
  baselineKpis: ProposalKPIs;
  mode: ReadMode;
  isBaseline: boolean;
  t: (key: string) => string;
  noGlData?: boolean;
}) {
  const nd = t('feeCalculator.noYoyData'); // 'N/D'

  const rows: MetricRow[] = [
    { key: 'totalMonthlyIncome', label: t('feeCalculator.totalMonthlyIncome'), kind: 'currency', get: (k) => k.totalMonthlyIncome },
    { key: 'glTotalCost', label: t('feeCalculator.glTotalCost'), kind: 'currency', get: (k) => k.glTotalCost, invariant: true },
    { key: 'netMonthlyIncome', label: t('feeCalculator.netMonthlyIncome'), kind: 'currency', get: (k) => k.netMonthlyIncome, tone: (v) => (v > 0 ? 'text-success' : 'text-overdue') },
    { key: 'ourFeeIncrease', label: t('feeCalculator.ourFeeIncrease'), termKey: 'incrementoPropio', kind: 'percent', get: (k) => k.ourFeeIncrease },
    { key: 'delta', label: t('feeCalculator.delta'), termKey: 'glPctCapita', kind: 'ratio', get: (k) => k.delta },
    { key: 'deltaVsGlYearAgo', label: t('feeCalculator.deltaVsGlYearAgo'), termKey: 'glPctCapita', kind: 'ratio', get: (k) => k.deltaVsGlYearAgo, dim: true, invariant: true },
    { key: 'yoyFeeVariation', label: t('feeCalculator.yoyFeeVariation'), kind: 'percent', get: (k) => k.yoyFeeVariation },
    { key: 'yoyIndexRef', label: t('feeCalculator.yoyIndexRef'), termKey: 'indiceAnual', kind: 'ratio', get: (k) => k.yoyAccumulatedIndex, dim: true, invariant: true },
  ];

  const formatAbs = (v: number, kind: MetricRow['kind']) => {
    if (kind === 'currency') return formatARS(v);
    if (kind === 'percent') return `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`;
    return `${v.toFixed(1)}%`; // ratio: unsigned level
  };
  const formatDeltaCell = (v: number, kind: MetricRow['kind']) => {
    if (kind === 'currency') return `${v >= 0 ? '+' : ''}${formatARS(v)}`;
    // A difference of two percentages is expressed in percentage points.
    return `${v >= 0 ? '+' : ''}${v.toFixed(1).replace('.', ',')}pp`;
  };

  const muted = 'text-muted-foreground';
  const renderCell = (row: MetricRow): { text: string; className: string } => {
    const kv = row.get(kpis);
    if (mode === 'absolute') {
      if (kv === null) return { text: nd, className: muted };
      if (row.dim) return { text: formatAbs(kv, row.kind), className: muted };
      return { text: formatAbs(kv, row.kind), className: row.tone ? row.tone(kv) : '' };
    }
    // Diferencia vs Actual
    if (isBaseline) return { text: 'Referencia', className: muted };
    if (kv === null) return { text: nd, className: muted };
    if (row.invariant) return { text: 'Igual en todas', className: muted };
    const bv = row.get(baselineKpis);
    if (bv === null) return { text: nd, className: muted };
    return { text: formatDeltaCell(kv - bv, row.kind), className: '' };
  };

  return (
    <div className="space-y-1 md:space-y-2">
      {noGlData && mode === 'absolute' && (
        <p className="text-[9px] md:text-xs text-muted-foreground italic mb-1 md:mb-2">{t('feeCalculator.enterGlFees')}</p>
      )}
      {rows.map((row) => {
        const cell = renderCell(row);
        return (
          <div key={row.key} className="flex items-center justify-between text-[10px] md:text-sm">
            {row.termKey ? (
              <TermTooltip termKey={row.termKey} className="text-muted-foreground truncate mr-1">
                {row.label}
              </TermTooltip>
            ) : (
              <span className="text-muted-foreground truncate mr-1">{row.label}</span>
            )}
            <span className={`font-medium whitespace-nowrap ${cell.className}`}>{cell.text}</span>
          </div>
        );
      })}
    </div>
  );
}

function ProposalCard({
  name,
  sublabel,
  termKey,
  proposedStd,
  proposedSol,
  kpis,
  t,
  noGlData,
  baselineKpis,
  mode,
  isBaseline,
}: {
  name: string;
  sublabel?: string;
  termKey?: string;
  proposedStd: number;
  proposedSol: number;
  kpis: ProposalKPIs;
  t: (key: string) => string;
  noGlData?: boolean;
  baselineKpis: ProposalKPIs;
  mode: ReadMode;
  isBaseline: boolean;
}) {
  const nd = t('feeCalculator.noYoyData');
  return (
    <Card>
      <CardHeader className="p-2 md:p-6 pb-1 md:pb-3">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-1">
          <Badge variant="secondary" className="text-[10px] md:text-xs">
            {termKey ? (
              <TermTooltip termKey={termKey} className="decoration-current/40">
                {name}
              </TermTooltip>
            ) : (
              name
            )}
          </Badge>
        </div>
        {/* Plain-language sublabel: what this proposal actually does, so a new
            treasurer does not have to decode the badge name. */}
        {sublabel && (
          <p className="mt-1 text-[9px] md:text-xs text-muted-foreground leading-snug">
            {sublabel}
          </p>
        )}
      </CardHeader>
      <CardContent className="p-2 md:p-6 pt-0 md:pt-0 space-y-1.5 md:space-y-4">
        <div className="space-y-1 md:grid md:grid-cols-2 md:gap-4 md:space-y-0">
          <div>
            <p className="text-[9px] md:text-xs text-muted-foreground">{t('feeCalculator.proposedStd')}</p>
            <p className="text-sm md:text-xl font-bold">{formatARS(proposedStd)}</p>
            <p className="text-[8px] md:text-[10px] text-muted-foreground">GL: {kpis.projectedGlStd !== null ? formatARS(kpis.projectedGlStd) : nd}</p>
          </div>
          <div>
            <p className="text-[9px] md:text-xs text-muted-foreground">{t('feeCalculator.proposedSol')}</p>
            <p className="text-sm md:text-xl font-bold">{formatARS(proposedSol)}</p>
            <p className="text-[8px] md:text-[10px] text-muted-foreground">GL: {kpis.projectedGlSol !== null ? formatARS(kpis.projectedGlSol) : nd}</p>
          </div>
        </div>
        <Separator />
        <KPIList kpis={kpis} baselineKpis={baselineKpis} mode={mode} isBaseline={isBaseline} t={t} noGlData={noGlData} />
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
    // The presets need a CVS; Actual (and Tu escenario) do not, so the reduced
    // column set still shows them. Tu escenario keeps its own card at this slice.
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

  // The bench baseline is Actual, selected by key (never by index or name) and
  // passed to every column including the custom one.
  const baselineKpis = (scenarios.find((s) => s.key === 'actual') ?? scenarios[0]).kpis;

  const customStdNum = customStdField.committed;
  const customSolNum = customSolField.committed;
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
                {selectedQuarter.quarterLabel}, CVS: <span className="font-semibold ml-1">{formatPct(selectedQuarter.cvs)}</span>
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

        {/* Section 1: Current Reference */}
        <div data-asistente="calc-referencia-actual">
          <h2 className="section-header">{t('feeCalculator.currentReference')}</h2>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-2 md:gap-4">
            <StatCard title={t('feeCalculator.currentStdFee')} value={formatARS(currentStdFee)} />
            <StatCard title={t('feeCalculator.currentSolFee')} value={formatARS(currentSolFee)} />
            <StatCard title={t('feeCalculator.activeStdMembers')} value={stdMemberCount} icon={<Users className="h-5 w-5 text-muted-foreground" />} />
            <StatCard title={t('feeCalculator.activeSolMembers')} value={solMemberCount} icon={<Users className="h-5 w-5 text-muted-foreground" />} />
            <StatCard
              title={t('feeCalculator.glStdFee')}
              value={glStdNum > 0 ? formatARS(glStdNum) : '-'}
              subtitle={glStdNum > 0 && hasCvs ? `Proyectado: ${formatARS(Math.round(glStdNum * (1 + selectedCVS / 100)))}` : undefined}
            />
            <StatCard
              title={t('feeCalculator.glSolFee')}
              value={glSolNum > 0 ? formatARS(glSolNum) : '-'}
              subtitle={glSolNum > 0 && hasCvs ? `Proyectado: ${formatARS(Math.round(glSolNum * (1 + selectedCVS / 100)))}` : undefined}
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
          <div className="mt-2 grid grid-cols-2 lg:grid-cols-4 gap-2 md:gap-4">
            {scenarios.map((s) => (
              <ProposalCard
                key={s.key}
                name={s.name}
                sublabel={s.sublabel}
                termKey={s.termKey}
                proposedStd={s.proposedStd}
                proposedSol={s.proposedSol}
                kpis={s.kpis}
                t={t}
                noGlData={noGlData}
                baselineKpis={baselineKpis}
                mode={mode}
                isBaseline={s.key === 'actual'}
              />
            ))}
          </div>
        </div>

        {/* Section 5: Custom Scenario */}
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
                <Input
                  type="number"
                  step="1"
                  placeholder="0"
                  className={customStdField.pending ? 'border-warning' : undefined}
                  {...customStdField.inputProps}
                  data-asistente="calc-escenario-personalizado"
                />
              </div>
              <div className="space-y-1.5">
                <Label>{t('feeCalculator.customSolFee')}</Label>
                <Input
                  type="number"
                  step="1"
                  placeholder="0"
                  className={customSolField.pending ? 'border-warning' : undefined}
                  {...customSolField.inputProps}
                />
              </div>
            </div>
            {/* Reserved-height hint so committing a value never injects layout. */}
            <p className="min-h-[1.25rem] text-xs text-muted-foreground">
              {customStdField.pending || customSolField.pending
                ? t('feeCalculator.customPending')
                : t('feeCalculator.customCommitted')}
            </p>
            <Separator />
            {customKPIs ? (
              <KPIList kpis={customKPIs} baselineKpis={baselineKpis} mode={mode} isBaseline={false} t={t} noGlData={noGlData} />
            ) : (
              <div className="text-center text-sm text-muted-foreground py-4">-</div>
            )}
          </CardContent>
        </Card>
      </div>
    </TooltipProvider>
  );
}
