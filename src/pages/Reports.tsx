import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FileText, Download, RefreshCw, Calendar, CheckCircle, Clock, AlertCircle, FileDown, Share2 } from 'lucide-react';
import { useMonthlyReports } from '@/hooks/useMonthlyReports';
import { useIsAdmin } from '@/hooks/useIsAdmin';
import { useExchangeRate } from '@/hooks/useExchangeRate';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

const monthNames = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

export default function Reports() {
  const { t } = useTranslation();
  const { isAdmin } = useIsAdmin();
  const { exchangeRate } = useExchangeRate();
  const { reports, isLoading, generateReport, getReportPdfUrl } = useMonthlyReports();
  
  const [isGenerateDialogOpen, setIsGenerateDialogOpen] = useState(false);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear().toString());
  const [selectedMonth, setSelectedMonth] = useState((new Date().getMonth() + 1).toString());
  const [forceRegenerate, setForceRegenerate] = useState(false);

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 5 }, (_, i) => currentYear - i);

  const handleGenerateReport = async () => {
    await generateReport.mutateAsync({
      year: parseInt(selectedYear),
      month: parseInt(selectedMonth),
      forceRegenerate,
    });
    setIsGenerateDialogOpen(false);
    setForceRegenerate(false);
  };

  const handleDownloadReport = async (pdfPath: string, year: number, month: number) => {
    const url = await getReportPdfUrl(pdfPath);
    if (url) {
      try {
        // Fetch the HTML content
        const response = await fetch(url);
        const htmlContent = await response.text();
        
        // Open a new window with the HTML content and trigger print dialog
        const printWindow = window.open('', '_blank');
        if (printWindow) {
          printWindow.document.write(htmlContent);
          printWindow.document.close();
          // Give the browser time to render, then trigger print
          setTimeout(() => {
            printWindow.print();
          }, 500);
        }
      } catch (error) {
        console.error('Error downloading report:', error);
        // Fallback: open in new tab
        window.open(url, '_blank');
      }
    }
  };

  const handleShareReport = async (pdfPath: string, year: number, month: number, isLite: boolean) => {
    const url = await getReportPdfUrl(pdfPath);
    if (!url) return;

    try {
      const response = await fetch(url);
      const htmlContent = await response.text();
      
      // Create a blob from HTML content
      const blob = new Blob([htmlContent], { type: 'text/html' });
      const reportType = isLite ? 'Lite' : 'Completo';
      const fileName = `Reporte_${monthNames[month - 1]}_${year}_${reportType}.html`;
      const file = new File([blob], fileName, { type: 'text/html' });

      if (navigator.share && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: `Reporte Financiero ${monthNames[month - 1]} ${year}`,
          text: `Reporte Financiero ${reportType} - ${monthNames[month - 1]} ${year}`,
        });
      } else if (navigator.share) {
        // Fallback: share URL only if file sharing not supported
        await navigator.share({
          title: `Reporte Financiero ${monthNames[month - 1]} ${year}`,
          text: `Reporte Financiero ${reportType} - ${monthNames[month - 1]} ${year}`,
          url: url,
        });
      } else {
        // Fallback for browsers without Web Share API
        handleDownloadReport(pdfPath, year, month);
      }
    } catch (error) {
      if ((error as Error).name !== 'AbortError') {
        console.error('Error sharing report:', error);
        // Fallback to download
        handleDownloadReport(pdfPath, year, month);
      }
    }
  };

  const canShare = typeof navigator !== 'undefined' && !!navigator.share;

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'generated':
        return (
          <Badge variant="default" className="bg-success/10 text-success border-success/20">
            <CheckCircle className="h-3 w-3 mr-1" />
            {t('reports.status.generated')}
          </Badge>
        );
      case 'generating':
        return (
          <Badge variant="default" className="bg-warning/10 text-warning border-warning/20">
            <Clock className="h-3 w-3 mr-1 animate-spin" />
            {t('reports.status.generating')}
          </Badge>
        );
      case 'failed':
        return (
          <Badge variant="destructive">
            <AlertCircle className="h-3 w-3 mr-1" />
            {t('reports.status.failed')}
          </Badge>
        );
      default:
        return null;
    }
  };

  const formatCurrency = (amount: number, currency = 'ARS') => {
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: currency === 'USD' ? 'USD' : 'ARS',
      minimumFractionDigits: 0,
    }).format(amount);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t('reports.title')}</h1>
          <p className="text-muted-foreground">{t('reports.subtitle')}</p>
        </div>
        {isAdmin && (
          <Dialog open={isGenerateDialogOpen} onOpenChange={setIsGenerateDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <FileText className="h-4 w-4 mr-2" />
                {t('reports.generateReport')}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t('reports.generateReport')}</DialogTitle>
                <DialogDescription>{t('reports.generateDescription')}</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>{t('reports.year')}</Label>
                    <Select value={selectedYear} onValueChange={setSelectedYear}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {years.map((year) => (
                          <SelectItem key={year} value={year.toString()}>
                            {year}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>{t('reports.month')}</Label>
                    <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {monthNames.map((name, index) => (
                          <SelectItem key={index} value={(index + 1).toString()}>
                            {name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="forceRegenerate"
                    checked={forceRegenerate}
                    onCheckedChange={(checked) => setForceRegenerate(checked === true)}
                  />
                  <Label htmlFor="forceRegenerate" className="text-sm text-muted-foreground">
                    {t('reports.forceRegenerate')}
                  </Label>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsGenerateDialogOpen(false)}>
                  {t('common.cancel')}
                </Button>
                <Button onClick={handleGenerateReport} disabled={generateReport.isPending}>
                  {generateReport.isPending ? (
                    <>
                      <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                      {t('reports.generating')}
                    </>
                  ) : (
                    <>
                      <FileText className="h-4 w-4 mr-2" />
                      {t('reports.generate')}
                    </>
                  )}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            {t('reports.reportsList')}
          </CardTitle>
          <CardDescription>{t('reports.reportsListDescription')}</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">
              {t('common.loading')}
            </div>
          ) : reports.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>{t('reports.noReports')}</p>
              {isAdmin && (
                <Button
                  variant="outline"
                  className="mt-4"
                  onClick={() => setIsGenerateDialogOpen(true)}
                >
                  {t('reports.generateFirst')}
                </Button>
              )}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('reports.period')}</TableHead>
                  <TableHead>{t('reports.generatedAt')}</TableHead>
                  <TableHead className="hidden md:table-cell">{t('common.status')}</TableHead>
                  <TableHead className="hidden md:table-cell text-right">{t('reports.netResult')}</TableHead>
                  <TableHead className="hidden md:table-cell text-right">{t('reports.collectionRate')}</TableHead>
                  <TableHead className="text-right">{t('common.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reports.map((report) => (
                  <TableRow key={report.id}>
                    <TableCell className="font-medium whitespace-nowrap">
                      {monthNames[report.report_month - 1]} {report.report_year}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm">
                      {report.generated_at
                        ? new Date(report.generated_at).toLocaleDateString('es-AR', {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                          })
                        : '-'}
                    </TableCell>
                    <TableCell className="hidden md:table-cell">{getStatusBadge(report.status)}</TableCell>
                    <TableCell className={`hidden md:table-cell text-right font-medium ${report.net_result >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {formatCurrency(report.net_result)}
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-right">
                      <span className={report.collection_percentage >= 80 ? 'text-green-600' : report.collection_percentage >= 50 ? 'text-yellow-600' : 'text-red-600'}>
                        {report.collection_percentage}%
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      {report.status === 'generated' && report.pdf_path && (
                        <DropdownMenu modal={false}>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm">
                              <Download className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onSelect={() => handleDownloadReport(report.pdf_path!, report.report_year, report.report_month)}
                            >
                              <FileText className="h-4 w-4 mr-2" />
                              {t('reports.downloadComprehensive')}
                            </DropdownMenuItem>
                            {report.lite_pdf_path && (
                              <DropdownMenuItem
                                onSelect={() => handleDownloadReport(report.lite_pdf_path!, report.report_year, report.report_month)}
                              >
                                <FileDown className="h-4 w-4 mr-2" />
                                {t('reports.downloadLite')}
                              </DropdownMenuItem>
                            )}
                            {canShare && (
                              <>
                                <DropdownMenuItem
                                  onSelect={() => handleShareReport(report.pdf_path!, report.report_year, report.report_month, false)}
                                >
                                  <Share2 className="h-4 w-4 mr-2" />
                                  {t('reports.shareComprehensive')}
                                </DropdownMenuItem>
                                {report.lite_pdf_path && (
                                  <DropdownMenuItem
                                    onSelect={() => handleShareReport(report.lite_pdf_path!, report.report_year, report.report_month, true)}
                                  >
                                    <Share2 className="h-4 w-4 mr-2" />
                                    {t('reports.shareLite')}
                                  </DropdownMenuItem>
                                )}
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {reports.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>{t('reports.totalReports')}</CardDescription>
              <CardTitle className="text-2xl">{reports.length}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>{t('reports.latestReport')}</CardDescription>
              <CardTitle className="text-2xl">
                {reports[0] ? `${monthNames[reports[0].report_month - 1]} ${reports[0].report_year}` : '-'}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>{t('reports.avgCollectionRate')}</CardDescription>
              <CardTitle className="text-2xl">
                {reports.length > 0
                  ? Math.round(reports.reduce((sum, r) => sum + r.collection_percentage, 0) / reports.length)
                  : 0}%
              </CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>{t('reports.avgNetResult')}</CardDescription>
              <CardTitle className="text-2xl">
                {formatCurrency(
                  reports.length > 0
                    ? reports.reduce((sum, r) => sum + r.net_result, 0) / reports.length
                    : 0
                )}
              </CardTitle>
            </CardHeader>
          </Card>
          {reports[0] && (
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Préstamos Activos (último reporte)</CardDescription>
                <CardTitle className="text-2xl">
                  {formatCurrency(
                    (reports[0].outstanding_loans_ars || 0) + 
                    (reports[0].outstanding_loans_usd || 0) * exchangeRate
                  )}
                </CardTitle>
                {(reports[0].outstanding_loans_usd || 0) > 0 && (
                  <p className="text-xs text-muted-foreground mt-1">
                    ARS {formatCurrency(reports[0].outstanding_loans_ars || 0)} + USD {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(reports[0].outstanding_loans_usd || 0)} × {exchangeRate}
                  </p>
                )}
              </CardHeader>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}