import { useState, useMemo, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Calculator, Users, Sparkles, AlertTriangle, RefreshCw, Download } from 'lucide-react';
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
}

function KPIList({ kpis, t, noGlData, baselineKpis }: { kpis: ProposalKPIs; t: (key: string) => string; noGlData?: boolean; baselineKpis?: ProposalKPIs }) {
  const isDelta = !!baselineKpis;

  const formatDelta = (val: number) => `${val >= 0 ? '+' : ''}${formatARS(val)}`;
  const formatDeltaPct = (val: number) => `${val >= 0 ? '+' : ''}${val.toFixed(1)}%`;

  const rows = isDelta ? [
    { label: t('feeCalculator.totalMonthlyIncome'), value: formatDelta(kpis.totalMonthlyIncome - baselineKpis.totalMonthlyIncome), color: kpis.totalMonthlyIncome >= baselineKpis.totalMonthlyIncome ? 'text-success' : 'text-destructive' },
    { label: t('feeCalculator.delta'), value: formatDeltaPct(kpis.delta - baselineKpis.delta), color: kpis.delta >= baselineKpis.delta ? 'text-success' : 'text-warning' },
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
      value: formatPct(kpis.delta),
      color: kpis.delta >= 0 ? 'text-success' : 'text-warning',
    },
    {
      label: t('feeCalculator.deltaVsGlYearAgo'),
      value: kpis.deltaVsGlYearAgo !== null ? formatPct(kpis.deltaVsGlYearAgo) : t('feeCalculator.noYoyData'),
      color: kpis.deltaVsGlYearAgo !== null ? (kpis.deltaVsGlYearAgo >= 0 ? 'text-success' : 'text-warning') : 'text-muted-foreground',
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
          </div>
          <div>
            <p className="text-[9px] md:text-xs text-muted-foreground">{t('feeCalculator.proposedSol')}</p>
            <p className="text-sm md:text-xl font-bold">{formatARS(proposedSol)}</p>
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

  const [selectedQuarterId, setSelectedQuarterId] = useState<string>('');
  const [autoSelectedQuarter, setAutoSelectedQuarter] = useState(false);
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

  // Auto-select quarter -1 (second most recent)
  useEffect(() => {
    if (!autoSelectedQuarter && quarterly.length > 1 && !selectedQuarterId) {
      setSelectedQuarterId(quarterly[1].quarterId);
      setAutoSelectedQuarter(true);
    } else if (!autoSelectedQuarter && quarterly.length === 1 && !selectedQuarterId) {
      setSelectedQuarterId(quarterly[0].quarterId);
      setAutoSelectedQuarter(true);
    }
  }, [quarterly, autoSelectedQuarter, selectedQuarterId]);

  const exportCvsToExcel = () => {
    if (!monthly.length) return;
    const BOM = '\uFEFF';
    const decSep = (n: number) => n.toFixed(2).replace('.', ',');

    const lines: string[] = [
      'Índice de Salarios (INDEC) — Variación Mensual',
      '',
      'Mes\tÍndice\tVariación %',
      ...monthly.map((p) => `${p.monthLabel}\t${decSep(p.indexValue)}\t${decSep(p.variation)}`),
      '',
      '',
      'Resumen Trimestral — CVS Acumulado',
      '',
      'Trimestre\tCVS Acumulado %\tDetalle Mensual',
      ...quarterly.map((q) => {
        const detail = q.monthlyBreakdown.map((m) => `${m.label}: ${decSep(m.variation)}%`).join(' | ');
        return `${q.quarterLabel}\t${decSep(q.cvs)}\t${detail}`;
      }),
    ];

    if (yoyAccumulated > 0) {
      lines.push('', '', `Índice Acumulado Anual (12 meses)\t${decSep(yoyAccumulated)}`);
    }

    const blob = new Blob([BOM + lines.join('\n')], { type: 'text/tab-separated-values;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `indice-salarios-cvs-${new Date().toISOString().slice(0, 10)}.xls`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Archivo descargado');
  };

  const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

  // Available months: up to 3 past and 3 future from current month
  const availableFeeMonths = useMemo(() => {
    const now = new Date();
    const months: { value: string; label: string }[] = [];
    for (let offset = -3; offset <= 3; offset++) {
      const d = new Date(now.getFullYear(), now.getMonth() + offset, 1);
      const value = d.toISOString().slice(0, 7) + '-01';
      const label = capitalize(d.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' }));
      months.push({ value, label });
    }
    return months.sort((a, b) => b.value.localeCompare(a.value));
  }, []);

  // Auto-select current month as default base
  useEffect(() => {
    if (!selectedBaseMonth) {
      const currentMonth = new Date().toISOString().slice(0, 7) + '-01';
      setSelectedBaseMonth(currentMonth);
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

  // YoY: compound CVS from 4 quarters, skipping the one immediately before base month's quarter
  const yoyAccumulated = useMemo(() => {
    if (!selectedBaseMonth || quarterly.length < 5) return 0;
    const [baseYear, baseMonthNum] = selectedBaseMonth.split('-').map(Number);
    const baseQ = Math.ceil(baseMonthNum / 3);
    const baseIdx = quarterly.findIndex((q) => q.year === baseYear && q.quarter === baseQ);
    // Skip base quarter + skip 1 more (the immediately prior), then take 4
    const startIdx = (baseIdx >= 0 ? baseIdx + 2 : 1);
    const prev4 = quarterly.slice(startIdx, startIdx + 4);
    if (prev4.length < 4) return 0;
    const result = (prev4.reduce((acc, q) => acc * (1 + q.cvs / 100), 1) - 1) * 100;
    console.log('[YoY Index]', { baseMonth: selectedBaseMonth, baseQ: `Q${baseQ} ${baseYear}`, baseIdx, startIdx, quarters: prev4.map(q => `${q.quarterId}: ${q.cvs}%`), accumulated: result.toFixed(2) + '%' });
    return result;
  }, [quarterly, selectedBaseMonth]);

  // Monthly breakdown for selected quarter
  const quarterMonthlyBreakdown = useMemo(() => {
    if (!selectedQuarter) return null;
    const points = monthly.filter((m) => selectedQuarter.months.includes(m.monthKey));
    return points;
  }, [selectedQuarter, monthly]);

  const computeKPIs = (proposedStd: number, proposedSol: number): ProposalKPIs => {
    // Projected GL fees = current GL per-member fee × (1 + CVS%)
    const projectedGlStd = Math.round(glStdNum * (1 + selectedCVS / 100));
    const projectedGlSol = Math.round(glSolNum * (1 + selectedCVS / 100));
    const glTotalCost = projectedGlStd * stdMemberCount + projectedGlSol * solMemberCount;
    const totalMonthlyIncome = stdMemberCount * proposedStd + solMemberCount * proposedSol;
    const netMonthlyIncome = totalMonthlyIncome - glTotalCost;
    const ourFeeIncrease = currentStdFee > 0 ? ((proposedStd - currentStdFee) / currentStdFee) * 100 : 0;
    const glFeeIncrease = selectedCVS;
    const delta = projectedGlStd > 0 ? ((proposedStd - projectedGlStd) / projectedGlStd) * 100 : 0;
    const yoyFeeVariation =
      feeOneYearAgoStd !== null && feeOneYearAgoStd > 0
        ? ((proposedStd - feeOneYearAgoStd) / feeOneYearAgoStd) * 100
        : null;

    const deltaVsGlYearAgo =
      feeOneYearAgoStd !== null && glStdOneYearAgo !== null && glStdOneYearAgo > 0
        ? ((feeOneYearAgoStd - glStdOneYearAgo) / glStdOneYearAgo) * 100
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
    };
  };

  const proposals = useMemo(() => {
    if (!hasCvs) return [];
    const round500 = (n: number) => Math.round(n / 500) * 500;
    const baseStd = round500(currentStdFee * (1 + selectedCVS / 100));
    const baseSol = round500(currentSolFee * (1 + selectedCVS / 100));
    const raw = [
      { buffer: -2, name: t('feeCalculator.low'), color: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200', isVariant: true },
      { buffer: 0, name: t('feeCalculator.baseline'), color: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200', isVariant: false },
      { buffer: 2, name: t('feeCalculator.high'), color: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200', isVariant: true },
    ];
    const items = raw.map((p) => {
      const proposedStd = round500(baseStd * (1 + p.buffer / 100));
      const proposedSol = round500(baseSol * (1 + p.buffer / 100));
      return { ...p, proposedStd, proposedSol, kpis: computeKPIs(proposedStd, proposedSol) };
    });
    const bKpis = items.find((p) => !p.isVariant)?.kpis;
    return items.map((p) => ({
      ...p,
      baselineKpis: p.isVariant ? bKpis : undefined,
    }));
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
              <TooltipContent>Exportar CSV para Excel</TooltipContent>
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
            {!fetchError && quarterly.length > 0 ? (
              <Select value={selectedQuarterId} onValueChange={setSelectedQuarterId}>
                <SelectTrigger className="w-[240px]">
                  <SelectValue placeholder={t('feeCalculator.selectQuarter')} />
                </SelectTrigger>
                <SelectContent>
                  {quarterly.slice(0, 6).map((q) => (
                    <SelectItem key={q.quarterId} value={q.quarterId}>
                      {q.quarterLabel} — CVS: {formatPct(q.cvs)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : !fetchError && cvsLoading ? (
              <Skeleton className="h-10 w-[240px]" />
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
              {proposals.map((p) => (
                <ProposalCard
                  key={p.buffer}
                  name={p.name}
                  badgeColor={p.color}
                  bufferPct={p.buffer}
                  proposedStd={p.proposedStd}
                  proposedSol={p.proposedSol}
                  kpis={p.kpis}
                  t={t}
                  noGlData={noGlData}
                  baselineKpis={p.baselineKpis}
                  isVariant={p.isVariant}
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
