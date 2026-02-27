import { useState } from 'react';
import { useMonthlyFees, MonthlyFee } from '@/hooks/useMonthlyFees';
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
import { CalendarIcon, PlusCircle, Pencil, Clock } from 'lucide-react';
import { FEE_TYPE_LABELS, FeeType } from '@/lib/types';
import { Badge } from '@/components/ui/badge';

export default function MonthlyFees() {
  const { monthlyFees, isLoading, upsertMonthlyFee } = useMonthlyFees();
  const { isAdmin } = useIsAdmin();
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [editFee, setEditFee] = useState<MonthlyFee | null>(null);

  // Group fees by month
  const feesByMonth = monthlyFees.reduce((acc, fee) => {
    const month = fee.year_month;
    if (!acc[month]) {
      acc[month] = { standard: 0, solidarity: 0 };
    }
    acc[month][fee.fee_type] = fee.amount;
    return acc;
  }, {} as Record<string, Record<FeeType, number>>);

  const sortedMonths = Object.keys(feesByMonth).sort((a, b) => b.localeCompare(a));

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS',
    }).format(amount);
  };

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
        <CurrentMonthFeeCard
          feeType="standard"
          fees={feesByMonth}
          onEdit={isAdmin ? (month) => {
            const fee = monthlyFees.find(
              (f) => f.year_month === month && f.fee_type === 'standard'
            );
            if (fee) setEditFee(fee);
          } : undefined}
        />
        <CurrentMonthFeeCard
          feeType="solidarity"
          fees={feesByMonth}
          onEdit={isAdmin ? (month) => {
            const fee = monthlyFees.find(
              (f) => f.year_month === month && f.fee_type === 'solidarity'
            );
            if (fee) setEditFee(fee);
          } : undefined}
        />
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
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{format(monthDate, 'MMMM yyyy')}</span>
                      {isUpcoming && (
                        <Badge variant="outline" className="text-xs">
                          <Clock className="mr-1 h-3 w-3" />
                          Upcoming
                        </Badge>
                      )}
                    </div>
                    {isAdmin && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          const fee = monthlyFees.find(
                            (f) => f.year_month === month && f.fee_type === 'standard'
                          );
                          if (fee) setEditFee(fee);
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <p className="text-muted-foreground text-xs">Standard</p>
                    <p className="font-mono font-semibold">{formatCurrency(feesByMonth[month].standard)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">Solidarity</p>
                    <p className="font-mono font-semibold">{formatCurrency(feesByMonth[month].solidarity)}</p>
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
          <CardDescription>Monthly fee rates by period</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Month</TableHead>
              <TableHead className="text-right">Standard Fee</TableHead>
              <TableHead className="text-right">Solidarity Fee</TableHead>
              {isAdmin && <TableHead className="w-[100px]"></TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedMonths.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
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
                      <TableCell className="text-right font-mono">
                        {formatCurrency(feesByMonth[month].standard)}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {formatCurrency(feesByMonth[month].solidarity)}
                      </TableCell>
                      {isAdmin && (
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              const fee = monthlyFees.find(
                                (f) => f.year_month === month && f.fee_type === 'standard'
                              );
                              if (fee) setEditFee(fee);
                            }}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      {editFee && (
        <EditMonthlyFeeDialog
          fee={editFee}
          fees={feesByMonth[editFee.year_month]}
          open={!!editFee}
          onOpenChange={(open) => !open && setEditFee(null)}
          onSave={upsertMonthlyFee.mutateAsync}
        />
      )}
    </div>
  );
}

function CurrentMonthFeeCard({
  feeType,
  fees,
  onEdit,
}: {
  feeType: FeeType;
  fees: Record<string, Record<FeeType, number>>;
  onEdit?: (month: string) => void;
}) {
  const currentMonth = new Date().toISOString().slice(0, 7) + '-01';
  const currentFee = fees[currentMonth]?.[feeType] ?? 0;

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS',
    }).format(amount);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-4">
        <CardTitle className="text-xs md:text-sm font-medium">
          {FEE_TYPE_LABELS[feeType]} Fee
        </CardTitle>
        {onEdit && (
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => onEdit(currentMonth)}>
            <Pencil className="h-4 w-4" />
          </Button>
        )}
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
          <DialogDescription>
            Set the fee amounts for a specific month
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Select Month</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full justify-start text-left font-normal",
                    !selectedDate && "text-muted-foreground"
                  )}
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
              <p className="text-sm text-destructive">
                Fees for this month already exist. Edit them instead.
              </p>
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

function EditMonthlyFeeDialog({
  fee,
  fees,
  open,
  onOpenChange,
  onSave,
}: {
  fee: MonthlyFee;
  fees: Record<FeeType, number>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (fee: { year_month: string; fee_type: FeeType; amount: number; gl_standard_amount?: number | null; gl_solidarity_amount?: number | null }) => Promise<unknown>;
}) {
  const [standardAmount, setStandardAmount] = useState(fees.standard.toString());
  const [solidarityAmount, setSolidarityAmount] = useState(fees.solidarity.toString());
  const [glStandardAmount, setGlStandardAmount] = useState(fee.gl_standard_amount?.toString() ?? '');
  const [glSolidarityAmount, setGlSolidarityAmount] = useState(fee.gl_solidarity_amount?.toString() ?? '');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    setIsSubmitting(true);
    const glStd = glStandardAmount ? parseFloat(glStandardAmount) : null;
    const glSol = glSolidarityAmount ? parseFloat(glSolidarityAmount) : null;
    try {
      await Promise.all([
        onSave({ year_month: fee.year_month, fee_type: 'standard', amount: parseFloat(standardAmount) || 0, gl_standard_amount: glStd, gl_solidarity_amount: glSol }),
        onSave({ year_month: fee.year_month, fee_type: 'solidarity', amount: parseFloat(solidarityAmount) || 0, gl_standard_amount: glStd, gl_solidarity_amount: glSol }),
      ]);
      onOpenChange(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Edit Monthly Fees</DialogTitle>
          <DialogDescription>
            Update fees for {format(parseISO(fee.year_month), 'MMMM yyyy')}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="edit_standard_amount">Standard Fee Amount</Label>
            <Input id="edit_standard_amount" type="number" step="0.01" value={standardAmount} onChange={(e) => setStandardAmount(e.target.value)} placeholder="0.00" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit_solidarity_amount">Solidarity Fee Amount</Label>
            <Input id="edit_solidarity_amount" type="number" step="0.01" value={solidarityAmount} onChange={(e) => setSolidarityAmount(e.target.value)} placeholder="0.00" />
          </div>
          <div className="pt-2 border-t">
            <p className="text-xs font-medium text-muted-foreground mb-3">Great Lodge Fees (optional)</p>
            <div className="space-y-2">
              <Label htmlFor="edit_gl_standard">GL Standard Fee (ARS)</Label>
              <Input id="edit_gl_standard" type="number" step="0.01" value={glStandardAmount} onChange={(e) => setGlStandardAmount(e.target.value)} placeholder="0.00" />
            </div>
            <div className="space-y-2 mt-2">
              <Label htmlFor="edit_gl_solidarity">GL Solidarity Fee (ARS)</Label>
              <Input id="edit_gl_solidarity" type="number" step="0.01" value={glSolidarityAmount} onChange={(e) => setGlSolidarityAmount(e.target.value)} placeholder="0.00" />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? 'Saving...' : 'Save Changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
