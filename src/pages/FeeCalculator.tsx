import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Calculator, ExternalLink, Info, Users, Sparkles, AlertTriangle, RefreshCw } from 'lucide-react';
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
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(n);

const formatPct = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`;

interface ProposalKPIs {
  totalMonthlyIncome: number;
  glTotalCost: number;
  netMonthlyIncome: number;
  ourFeeIncrease: number;
  glFeeIncrease: number;
  delta: number;
  yoyFeeVariation: number | null;
  yoyAccumulatedIndex: number;
}

function KPIList({ kpis, t, noGlData }: { kpis: ProposalKPIs; t: (key: string) => string; noGlData?: boolean }) {
  const rows = [
    { label: t('feeCalculator.totalMonthlyIncome'), value: formatARS(kpis.totalMonthlyIncome), color: '' },
    { label: t('feeCalculator.glTotalCost'), value: formatARS(kpis.glTotalCost), color: '' },
    {
      label: t('feeCalculator.netMonthlyIncome'),
      value: formatARS(kpis.netMonthlyIncome),
      color: kpis.netMonthlyIncome > 0 ? 'text-success' : 'text-overdue',
    },
    { label: t('feeCalculator.ourFeeIncrease'), value: formatPct(kpis.ourFeeIncrease), color: '' },
    { label: t('feeCalculator.glFeeIncrease'), value: formatPct(kpis.glFeeIncrease), color: 'text-muted-foreground' },
    {
      label: t('feeCalculator.delta'),
      value: formatPct(kpis.delta),
      color: kpis.delta >= 0 ? 'text-success' : 'text-warning',
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
    <div className="space-y-2">
      {noGlData && (
        <p className="text-xs text-muted-foreground italic mb-2">{t('feeCalculator.enterGlFees')}</p>
      )}
      {rows.map((row) => (
        <div key={row.label} className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">{row.label}</span>
          <span className={`font-medium ${row.color}`}>{row.value}</span>
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
}: {
  name: string;
  badgeColor: string;
  bufferPct: number;
  proposedStd: number;
  proposedSol: number;
  kpis: ProposalKPIs;
  t: (key: string, opts?: Record<string, unknown>) => string;
  noGlData?: boolean;
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <Badge className={badgeColor}>{name}</Badge>
          <span className="text-xs text-muted-foreground">
            {t('feeCalculator.bufferAboveCvs', { pct: bufferPct })}
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-muted-foreground">{t('feeCalculator.proposedStd')}</p>
            <p className="text-xl font-bold">{formatARS(proposedStd)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{t('feeCalculator.proposedSol')}</p>
            <p className="text-xl font-bold">{formatARS(proposedSol)}</p>
          </div>
        </div>
        <Separator />
        <KPIList kpis={kpis} t={t} noGlData={noGlData} />
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
  const [manualCvs, setManualCvs] = useState<string>('');
  const [otherGlExpenses, setOtherGlExpenses] = useState<string>('');
  const [manualGlStd, setManualGlStd] = useState<string>('');
  const [manualGlSol, setManualGlSol] = useState<string>('');
  const [customStd, setCustomStd] = useState<string>('');
  const [customSol, setCustomSol] = useState<string>('');

  const isLoading = feesLoading || membersLoading;
  const fetchError = cvsData?.fetchError ?? false;
  const quarterly = cvsData?.quarterly ?? [];
  const monthly = cvsData?.monthly ?? [];

  // Derive current fees from latest monthly_fees entries
  const { currentStdFee, currentSolFee, feeOneYearAgoStd } = useMemo(() => {
    if (!monthlyFees.length) return { currentStdFee: 0, currentSolFee: 0, feeOneYearAgoStd: null as number | null };
    const sorted = [...monthlyFees].sort((a, b) => b.year_month.localeCompare(a.year_month));
    const latestStd = sorted.find((f) => f.fee_type === 'standard');
    const latestSol = sorted.find((f) => f.fee_type === 'solidarity');

    const now = new Date();
    const yearAgo = new Date(now.getFullYear() - 1, now.getMonth(), 1);
    const yearAgoStr = yearAgo.toISOString().slice(0, 7) + '-01';
    const stdYearAgo = sorted.find((f) => f.fee_type === 'standard' && f.year_month === yearAgoStr);

    return {
      currentStdFee: latestStd?.amount ?? 0,
      currentSolFee: latestSol?.amount ?? 0,
      feeOneYearAgoStd: stdYearAgo?.amount ?? null,
    };
  }, [monthlyFees]);

  // GL fees from DB (latest entry with non-null GL values)
  const glFromDb = useMemo(() => {
    if (!monthlyFees.length) return null;
    const sorted = [...monthlyFees].sort((a, b) => b.year_month.localeCompare(a.year_month));
    const withGl = sorted.find((f) => f.gl_standard_amount !== null || f.gl_solidarity_amount !== null);
    if (!withGl) return null;
    return {
      standard: withGl.gl_standard_amount ?? 0,
      solidarity: withGl.gl_solidarity_amount ?? 0,
      month: new Date(withGl.year_month).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' }),
    };
  }, [monthlyFees]);

  const glStdNum = glFromDb ? glFromDb.standard : (parseFloat(manualGlStd) || 0);
  const glSolNum = glFromDb ? glFromDb.solidarity : (parseFloat(manualGlSol) || 0);
  const otherGlNum = parseFloat(otherGlExpenses) || 0;
  const noGlData = glStdNum === 0 && glSolNum === 0 && otherGlNum === 0;

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

  // YoY auto-calculated from last 12 monthly points
  const yoyAccumulated = useMemo(() => {
    if (monthly.length < 12) return 0;
    const last12 = monthly.slice(-12);
    return (last12.reduce((acc, p) => acc * (1 + p.variation / 100), 1) - 1) * 100;
  }, [monthly]);

  // Monthly breakdown for selected quarter
  const quarterMonthlyBreakdown = useMemo(() => {
    if (!selectedQuarter) return null;
    const points = monthly.filter((m) => selectedQuarter.months.includes(m.monthKey));
    return points;
  }, [selectedQuarter, monthly]);

  const computeKPIs = (proposedStd: number, proposedSol: number): ProposalKPIs => {
    const glTotalCost = glStdNum + glSolNum + otherGlNum;
    const totalMonthlyIncome = stdMemberCount * proposedStd + solMemberCount * proposedSol;
    const netMonthlyIncome = totalMonthlyIncome - glTotalCost;
    const ourFeeIncrease = currentStdFee > 0 ? ((proposedStd - currentStdFee) / currentStdFee) * 100 : 0;
    const glFeeIncrease = selectedCVS;
    const delta = ourFeeIncrease - glFeeIncrease;
    const yoyFeeVariation =
      feeOneYearAgoStd !== null && feeOneYearAgoStd > 0
        ? ((proposedStd - feeOneYearAgoStd) / feeOneYearAgoStd) * 100
        : null;

    return {
      totalMonthlyIncome,
      glTotalCost,
      netMonthlyIncome,
      ourFeeIncrease,
      glFeeIncrease,
      delta,
      yoyFeeVariation,
      yoyAccumulatedIndex: yoyAccumulated,
    };
  };

  const proposals = useMemo(() => {
    if (!hasCvs) return [];
    return [
      { buffer: 0, name: t('feeCalculator.conservative'), color: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200' },
      { buffer: 5, name: t('feeCalculator.moderate'), color: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200' },
      { buffer: 10, name: t('feeCalculator.aggressive'), color: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200' },
    ].map((p) => {
      const proposedStd = Math.round(currentStdFee * (1 + selectedCVS / 100) * (1 + p.buffer / 100));
      const proposedSol = Math.round(currentSolFee * (1 + selectedCVS / 100) * (1 + p.buffer / 100));
      return { ...p, proposedStd, proposedSol, kpis: computeKPIs(proposedStd, proposedSol) };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasCvs, selectedCVS, currentStdFee, currentSolFee, stdMemberCount, solMemberCount, glStdNum, glSolNum, otherGlNum, yoyAccumulated, feeOneYearAgoStd, t]);

  const customStdNum = parseFloat(customStd) || 0;
  const customSolNum = parseFloat(customSol) || 0;
  const customKPIs = useMemo(
    () => (customStdNum > 0 || customSolNum > 0 ? computeKPIs(customStdNum, customSolNum) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [customStdNum, customSolNum, stdMemberCount, solMemberCount, glStdNum, glSolNum, otherGlNum, selectedCVS, yoyAccumulated, currentStdFee, feeOneYearAgoStd]
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
          <Button variant="outline" size="sm" asChild>
            <a
              href="https://www.indec.gob.ar/indec/web/Institucional-Indec-InformesTecnicos-61"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1"
            >
              <ExternalLink className="h-4 w-4" />
              {t('feeCalculator.indecLink')}
            </a>
          </Button>
        </div>

        {/* Warning if no fees */}
        {currentStdFee === 0 && (
          <div className="rounded-lg border border-warning/30 bg-warning/10 p-4 text-sm text-warning">
            {t('feeCalculator.noCurrentFees')}
          </div>
        )}

        {/* Section 1 — Current Reference */}
        <div>
          <h2 className="section-header">{t('feeCalculator.currentReference')}</h2>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard title={t('feeCalculator.currentStdFee')} value={formatARS(currentStdFee)} />
            <StatCard title={t('feeCalculator.currentSolFee')} value={formatARS(currentSolFee)} />
            <StatCard title={t('feeCalculator.activeStdMembers')} value={stdMemberCount} icon={<Users className="h-5 w-5 text-muted-foreground" />} />
            <StatCard title={t('feeCalculator.activeSolMembers')} value={solMemberCount} icon={<Users className="h-5 w-5 text-muted-foreground" />} />
          </div>
        </div>

        {/* Section 2 — CVS Quarter Selection */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg">{t('feeCalculator.cvsSelection')}</CardTitle>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => refetchCvs()}
              disabled={cvsFetching}
              className="h-8 w-8"
            >
              <RefreshCw className={`h-4 w-4 ${cvsFetching ? 'animate-spin' : ''}`} />
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* CVS API fetch error warning */}
            {fetchError && !cvsLoading && (
              <div className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm text-warning flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>{t('feeCalculator.fetchError')}</span>
              </div>
            )}

            {/* Quarter selector or manual fallback */}
            {!fetchError && quarterly.length > 0 ? (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label>{t('feeCalculator.selectQuarter')}</Label>
                  <Select value={selectedQuarterId} onValueChange={setSelectedQuarterId}>
                    <SelectTrigger>
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
                </div>

                {/* Monthly breakdown */}
                {quarterMonthlyBreakdown && quarterMonthlyBreakdown.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                  {quarterMonthlyBreakdown.map((p, i) => (
                      <span key={p.monthKey}>
                        {i > 0 && ' | '}
                        {p.monthLabel}: {formatPct(p.variation)}
                      </span>
                    ))}
                  </p>
                )}

                {/* YoY auto-calculated */}
                {monthly.length >= 12 && (
                  <div className="rounded-lg bg-muted/50 p-3">
                    <p className="text-xs text-muted-foreground">{t('feeCalculator.yoyAutoCalc')}</p>
                    <p className="text-lg font-bold">{formatPct(yoyAccumulated)}</p>
                  </div>
                )}
              </div>
            ) : !fetchError && cvsLoading ? (
              <Skeleton className="h-10 w-full" />
            ) : (
              /* Manual CVS input fallback */
              <div className="space-y-1.5">
                <Label>{t('feeCalculator.manualCvs')}</Label>
                <Input
                  type="number"
                  step="0.1"
                  placeholder="e.g. 8.5"
                  value={manualCvs}
                  onChange={(e) => setManualCvs(e.target.value)}
                />
              </div>
            )}
          </CardContent>
        </Card>

        {/* CVS Historical Table */}
        {monthly.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Índice de Salarios — Variación Mensual</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {/* Quarterly summary table */}
                {quarterly.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold mb-2">Resumen Trimestral</h3>
                    <div className="overflow-x-auto rounded-md border">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b bg-muted/50">
                            <th className="text-left p-2 font-medium">Trimestre</th>
                            <th className="text-right p-2 font-medium">CVS Compuesto</th>
                            <th className="text-left p-2 font-medium">Detalle Mensual</th>
                          </tr>
                        </thead>
                        <tbody>
                          {quarterly.map((q) => (
                            <tr key={q.quarterId} className="border-b last:border-0">
                              <td className="p-2 font-medium">{q.quarterLabel}</td>
                              <td className={`p-2 text-right font-bold ${q.cvs >= 0 ? 'text-success' : 'text-overdue'}`}>
                                {formatPct(q.cvs)}
                              </td>
                              <td className="p-2 text-muted-foreground text-xs">
                                {q.monthlyBreakdown.map((m, i) => (
                                  <span key={i}>{i > 0 && ' | '}{m.label}: {formatPct(m.variation)}</span>
                                ))}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Monthly detail table */}
                <div>
                  <h3 className="text-sm font-semibold mb-2">Detalle Mensual (últimos {monthly.length} meses)</h3>
                  <div className="overflow-x-auto rounded-md border">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-muted/50">
                          <th className="text-left p-2 font-medium">Mes</th>
                          <th className="text-right p-2 font-medium">Variación %</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...monthly].reverse().map((m) => (
                          <tr key={m.monthKey} className="border-b last:border-0">
                            <td className="p-2">{m.monthLabel}</td>
                            <td className={`p-2 text-right font-medium ${m.variation >= 0 ? 'text-success' : 'text-overdue'}`}>
                              {formatPct(m.variation)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Section 3 — GL Fees */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{t('feeCalculator.glFees')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {glFromDb ? (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground">{t('feeCalculator.glStdFee')}</p>
                    <p className="text-lg font-bold">{formatARS(glFromDb.standard)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">{t('feeCalculator.glSolFee')}</p>
                    <p className="text-lg font-bold">{formatARS(glFromDb.solidarity)}</p>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  {t('feeCalculator.glAutoLoaded', { month: glFromDb.month })} —{' '}
                  <Link to="/monthly-fees" className="underline text-primary">
                    {t('nav.monthlyFees')}
                  </Link>
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>{t('feeCalculator.glStdFee')}</Label>
                  <Input type="number" step="0.01" placeholder="0.00" value={manualGlStd} onChange={(e) => setManualGlStd(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>{t('feeCalculator.glSolFee')}</Label>
                  <Input type="number" step="0.01" placeholder="0.00" value={manualGlSol} onChange={(e) => setManualGlSol(e.target.value)} />
                </div>
              </div>
            )}
            <div className="space-y-1.5">
              <div className="flex items-center gap-1">
                <Label>{t('feeCalculator.otherGlExpenses')}</Label>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">{t('feeCalculator.otherGlExpensesTooltip')}</TooltipContent>
                </Tooltip>
              </div>
              <Input type="number" step="0.01" placeholder="0.00" value={otherGlExpenses} onChange={(e) => setOtherGlExpenses(e.target.value)} />
            </div>
          </CardContent>
        </Card>

        {/* Section 4 — Proposals */}
        <div>
          <h2 className="section-header">{t('feeCalculator.proposals')}</h2>
          {!hasCvs ? (
            <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
              {t('feeCalculator.selectQuarterFirst')}
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
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
