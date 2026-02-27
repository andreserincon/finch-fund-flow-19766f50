import { useState, useCallback } from 'react';
import { useMonthlyFees } from '@/hooks/useMonthlyFees';
import { useIsAdmin } from '@/hooks/useIsAdmin';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import { format, startOfMonth, isFuture, startOfDay, parseISO } from 'date-fns';
import { CalendarIcon, PlusCircle, Clock } from 'lucide-react';
import { FEE_TYPE_LABELS, FeeType } from '@/lib/types';
import { Badge } from '@/components/ui/badge';

type MonthData = {
  standard: number;
  solidarity: number;
  gl_standard: number | null;
  gl_solidarity: number | null;
};

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(amount);

/** Inline-editable cell: shows value, on click becomes input, saves on blur/enter */
function EditableCell({
  value,
  onSave,
  disabled,
  placeholder = '—',
  isMuted = false,
}: {
  value: number | null;
  onSave: (val: number | null) => void;
  disabled?: boolean;
  placeholder?: string;
  isMuted?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  const startEdit = () => {
    if (disabled) return;
    setDraft(value != null && value !== 0 ? value.toString() : '');
    setEditing(true);
  };

  const commit = () => {
    setEditing(false);
    const parsed = draft.trim() === '' ? null : parseFloat(draft);
    if (parsed !== value && !(parsed === null && value === null)) {
      onSave(parsed);
    }
  };

  if (editing) {
    return (
      <Input
        type="number"
        step="0.01"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false); }}
        autoFocus
        className="h-8 w-24 text-right font-mono text-sm"
      />
    );
  }

  const display = value != null && value !== 0 ? formatCurrency(value) : placeholder;

  return (
    <span
      onClick={startEdit}
      className={cn(
        'font-mono text-sm cursor-pointer rounded px-1.5 py-0.5 transition-colors',
        disabled ? 'cursor-default' : 'hover:bg-muted',
        isMuted && 'text-muted-foreground',
      )}
    >
      {display}
    </span>
  );
}

export default function MonthlyFees() {
  const { monthlyFees, isLoading, upsertMonthlyFee } = useMonthlyFees();
  const { isAdmin } = useIsAdmin();
  const [addDialogOpen, setAddDialogOpen] = useState(false);

  // Group fees by month
  const feesByMonth = monthlyFees.reduce((acc, fee) => {
    const month = fee.year_month;
    if (!acc[month]) {
      acc[month] = { standard: 0, solidarity: 0, gl_standard: null, gl_solidarity: null };
    }
    acc[month][fee.fee_type] = fee.amount;
    if (fee.gl_standard_amount != null) acc[month].gl_standard = fee.gl_standard_amount;
    if (fee.gl_solidarity_amount != null) acc[month].gl_solidarity = fee.gl_solidarity_amount;
    return acc;
  }, {} as Record<string, MonthData>);

  const sortedMonths = Object.keys(feesByMonth).sort((a, b) => b.localeCompare(a));

  const handleSave = useCallback(
    (yearMonth: string, field: 'standard' | 'solidarity' | 'gl_standard' | 'gl_solidarity', val: number | null) => {
      const current = feesByMonth[yearMonth];
      if (!current) return;

      if (field === 'standard' || field === 'solidarity') {
        upsertMonthlyFee.mutate({
          year_month: yearMonth,
          fee_type: field as FeeType,
          amount: val ?? 0,
        });
      } else {
        // GL fields — save on both fee_type rows
        const glPayload = field === 'gl_standard'
          ? { gl_standard_amount: val }
          : { gl_solidarity_amount: val };

        upsertMonthlyFee.mutate({
          year_month: yearMonth,
          fee_type: 'standard',
          amount: current.standard,
          ...glPayload,
        });
        upsertMonthlyFee.mutate({
          year_month: yearMonth,
          fee_type: 'solidarity',
          amount: current.solidarity,
          ...glPayload,
        });
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [feesByMonth, upsertMonthlyFee],
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return (
    <div className="space-y-4 md:space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-foreground">Monthly Fees</h1>
          <p className="text-sm text-muted-foreground">
            Configure fee amounts for Standard and Solidarity members
          </p>
        </div>
        {isAdmin && (
          <AddMonthlyFeeDialog
            open={addDialogOpen}
            onOpenChange={setAddDialogOpen}
            onSave={upsertMonthlyFee.mutateAsync}
            existingMonths={sortedMonths}
          />
        )}
      </div>

      {/* Current Month Card */}
      <div className="grid gap-3 grid-cols-2">
        <CurrentMonthFeeCard feeType="standard" fees={feesByMonth} />
        <CurrentMonthFeeCard feeType="solidarity" fees={feesByMonth} />
      </div>

      {/* History - Mobile Card View */}
      <div className="md:hidden space-y-3">
        <h3 className="font-semibold">Fee History</h3>
        {sortedMonths.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground bg-card rounded-lg border">
            No monthly fees configured yet
          </div>
        ) : (
          sortedMonths.map((month) => {
            const monthDate = parseISO(month);
            const isUpcoming = isFuture(startOfDay(monthDate));
            return (
              <div key={month} className="rounded-lg border bg-card p-4">
                <div className="flex items-center gap-2 mb-3">
                  <span className="font-medium">{format(monthDate, 'MMMM yyyy')}</span>
                  {isUpcoming && (
                    <Badge variant="outline" className="text-xs">
                      <Clock className="mr-1 h-3 w-3" />
                      Upcoming
                    </Badge>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <p className="text-muted-foreground text-xs">Standard</p>
                    <EditableCell value={feesByMonth[month].standard} onSave={(v) => handleSave(month, 'standard', v)} disabled={!isAdmin} />
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">Solidarity</p>
                    <EditableCell value={feesByMonth[month].solidarity} onSave={(v) => handleSave(month, 'solidarity', v)} disabled={!isAdmin} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm mt-2 pt-2 border-t border-dashed">
                  <div>
                    <p className="text-muted-foreground text-xs">GL Standard</p>
                    <EditableCell value={feesByMonth[month].gl_standard} onSave={(v) => handleSave(month, 'gl_standard', v)} disabled={!isAdmin} isMuted />
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">GL Solidarity</p>
                    <EditableCell value={feesByMonth[month].gl_solidarity} onSave={(v) => handleSave(month, 'gl_solidarity', v)} disabled={!isAdmin} isMuted />
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* History - Desktop Table View */}
      <Card className="hidden md:block">
        <CardHeader>
          <CardTitle>Fee History</CardTitle>
          <CardDescription>Click any value to edit inline</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Month</TableHead>
                <TableHead className="text-right">Standard Fee</TableHead>
                <TableHead className="text-right">Solidarity Fee</TableHead>
                <TableHead className="text-right">GL Std</TableHead>
                <TableHead className="text-right">GL Sol</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedMonths.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                    No monthly fees configured yet
                  </TableCell>
                </TableRow>
              ) : (
                sortedMonths.map((month) => {
                  const monthDate = parseISO(month);
                  const isUpcoming = isFuture(startOfDay(monthDate));
                  return (
                    <TableRow key={month}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          {format(monthDate, 'MMMM yyyy')}
                          {isUpcoming && (
                            <Badge variant="outline" className="text-xs">
                              <Clock className="mr-1 h-3 w-3" />
                              Upcoming
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <EditableCell value={feesByMonth[month].standard} onSave={(v) => handleSave(month, 'standard', v)} disabled={!isAdmin} />
                      </TableCell>
                      <TableCell className="text-right">
                        <EditableCell value={feesByMonth[month].solidarity} onSave={(v) => handleSave(month, 'solidarity', v)} disabled={!isAdmin} />
                      </TableCell>
                      <TableCell className="text-right">
                        <EditableCell value={feesByMonth[month].gl_standard} onSave={(v) => handleSave(month, 'gl_standard', v)} disabled={!isAdmin} isMuted />
                      </TableCell>
                      <TableCell className="text-right">
                        <EditableCell value={feesByMonth[month].gl_solidarity} onSave={(v) => handleSave(month, 'gl_solidarity', v)} disabled={!isAdmin} isMuted />
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function CurrentMonthFeeCard({
  feeType,
  fees,
}: {
  feeType: FeeType;
  fees: Record<string, MonthData>;
}) {
  const currentMonth = new Date().toISOString().slice(0, 7) + '-01';
  const currentFee = fees[currentMonth]?.[feeType] ?? 0;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-4">
        <CardTitle className="text-xs md:text-sm font-medium">
          {FEE_TYPE_LABELS[feeType]} Fee
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 pt-0">
        <div className="text-lg md:text-2xl font-bold truncate">{formatCurrency(currentFee)}</div>
        <p className="text-xs text-muted-foreground truncate">
          {format(new Date(), 'MMM yyyy')}
        </p>
      </CardContent>
    </Card>
  );
}

function AddMonthlyFeeDialog({
  open,
  onOpenChange,
  onSave,
  existingMonths,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (fee: { year_month: string; fee_type: FeeType; amount: number; gl_standard_amount?: number | null; gl_solidarity_amount?: number | null }) => Promise<unknown>;
  existingMonths: string[];
}) {
  const [selectedDate, setSelectedDate] = useState<Date>(startOfMonth(new Date()));
  const [standardAmount, setStandardAmount] = useState('');
  const [solidarityAmount, setSolidarityAmount] = useState('');
  const [glStandardAmount, setGlStandardAmount] = useState('');
  const [glSolidarityAmount, setGlSolidarityAmount] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const selectedMonth = format(selectedDate, 'yyyy-MM-dd');
  const alreadyExists = existingMonths.includes(selectedMonth);

  const handleSubmit = async () => {
    if (alreadyExists) return;
    setIsSubmitting(true);
    const glStd = glStandardAmount ? parseFloat(glStandardAmount) : null;
    const glSol = glSolidarityAmount ? parseFloat(glSolidarityAmount) : null;
    try {
      await Promise.all([
        onSave({ year_month: selectedMonth, fee_type: 'standard', amount: parseFloat(standardAmount) || 0, gl_standard_amount: glStd, gl_solidarity_amount: glSol }),
        onSave({ year_month: selectedMonth, fee_type: 'solidarity', amount: parseFloat(solidarityAmount) || 0, gl_standard_amount: glStd, gl_solidarity_amount: glSol }),
      ]);
      setStandardAmount('');
      setSolidarityAmount('');
      setGlStandardAmount('');
      setGlSolidarityAmount('');
      setSelectedDate(startOfMonth(new Date()));
      onOpenChange(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button>
          <PlusCircle className="mr-2 h-4 w-4" />
          Add Monthly Fees
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Add Monthly Fees</DialogTitle>
          <DialogDescription>Set the fee amounts for a specific month</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Select Month</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn("w-full justify-start text-left font-normal", !selectedDate && "text-muted-foreground")}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {format(selectedDate, 'MMMM yyyy')}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={(date) => date && setSelectedDate(startOfMonth(date))}
                  disabled={(date) => date.getDate() !== 1}
                  initialFocus
                  className="p-3 pointer-events-auto"
                />
              </PopoverContent>
            </Popover>
            {alreadyExists && (
              <p className="text-sm text-destructive">Fees for this month already exist. Edit them instead.</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="standard_amount">Standard Fee Amount</Label>
            <Input id="standard_amount" type="number" step="0.01" value={standardAmount} onChange={(e) => setStandardAmount(e.target.value)} placeholder="0.00" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="solidarity_amount">Solidarity Fee Amount</Label>
            <Input id="solidarity_amount" type="number" step="0.01" value={solidarityAmount} onChange={(e) => setSolidarityAmount(e.target.value)} placeholder="0.00" />
          </div>
          <div className="pt-2 border-t">
            <p className="text-xs font-medium text-muted-foreground mb-3">Great Lodge Fees (optional)</p>
            <div className="space-y-2">
              <Label htmlFor="gl_standard_amount">GL Standard Fee (ARS)</Label>
              <Input id="gl_standard_amount" type="number" step="0.01" value={glStandardAmount} onChange={(e) => setGlStandardAmount(e.target.value)} placeholder="0.00" />
            </div>
            <div className="space-y-2 mt-2">
              <Label htmlFor="gl_solidarity_amount">GL Solidarity Fee (ARS)</Label>
              <Input id="gl_solidarity_amount" type="number" step="0.01" value={glSolidarityAmount} onChange={(e) => setGlSolidarityAmount(e.target.value)} placeholder="0.00" />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={isSubmitting || alreadyExists}>
            {isSubmitting ? 'Saving...' : 'Save Fees'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
