import { useState } from 'react';
import { useMonthlyFees, MonthlyFee } from '@/hooks/useMonthlyFees';
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
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'EUR',
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
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Monthly Fees</h1>
          <p className="text-muted-foreground">
            Configure fee amounts for Standard and Solidarity members
          </p>
        </div>
        <AddMonthlyFeeDialog
          open={addDialogOpen}
          onOpenChange={setAddDialogOpen}
          onSave={upsertMonthlyFee.mutateAsync}
          existingMonths={sortedMonths}
        />
      </div>

      {/* Current Month Card */}
      <div className="grid gap-4 md:grid-cols-2">
        <CurrentMonthFeeCard
          feeType="standard"
          fees={feesByMonth}
          onEdit={(month) => {
            const fee = monthlyFees.find(
              (f) => f.year_month === month && f.fee_type === 'standard'
            );
            if (fee) setEditFee(fee);
          }}
        />
        <CurrentMonthFeeCard
          feeType="solidarity"
          fees={feesByMonth}
          onEdit={(month) => {
            const fee = monthlyFees.find(
              (f) => f.year_month === month && f.fee_type === 'solidarity'
            );
            if (fee) setEditFee(fee);
          }}
        />
      </div>

      {/* History Table */}
      <Card>
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
                <TableHead className="w-[100px]"></TableHead>
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
  onEdit: (month: string) => void;
}) {
  const currentMonth = new Date().toISOString().slice(0, 7) + '-01';
  const currentFee = fees[currentMonth]?.[feeType] ?? 0;

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'EUR',
    }).format(amount);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">
          {FEE_TYPE_LABELS[feeType]} Fee
        </CardTitle>
        <Button variant="ghost" size="sm" onClick={() => onEdit(currentMonth)}>
          <Pencil className="h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{formatCurrency(currentFee)}</div>
        <p className="text-xs text-muted-foreground">
          Current month ({format(new Date(), 'MMMM yyyy')})
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
  onSave: (fee: { year_month: string; fee_type: FeeType; amount: number }) => Promise<unknown>;
  existingMonths: string[];
}) {
  const [standardAmount, setStandardAmount] = useState('');
  const [solidarityAmount, setSolidarityAmount] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const currentMonth = format(startOfMonth(new Date()), 'yyyy-MM-dd');
  const alreadyExists = existingMonths.includes(currentMonth);

  const handleSubmit = async () => {
    if (alreadyExists) return;
    
    setIsSubmitting(true);
    try {
      await Promise.all([
        onSave({ year_month: currentMonth, fee_type: 'standard', amount: parseFloat(standardAmount) || 0 }),
        onSave({ year_month: currentMonth, fee_type: 'solidarity', amount: parseFloat(solidarityAmount) || 0 }),
      ]);
      
      setStandardAmount('');
      setSolidarityAmount('');
      onOpenChange(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button disabled={alreadyExists}>
          <PlusCircle className="mr-2 h-4 w-4" />
          {alreadyExists ? 'Current Month Already Set' : 'Add Monthly Fees'}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Add Monthly Fees</DialogTitle>
          <DialogDescription>
            Set the fee amounts for {format(new Date(), 'MMMM yyyy')}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="rounded-md bg-muted p-3">
            <div className="flex items-center gap-2">
              <CalendarIcon className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">{format(new Date(), 'MMMM yyyy')}</span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Fees can only be added for the current month
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="standard_amount">Standard Fee Amount</Label>
            <Input
              id="standard_amount"
              type="number"
              step="0.01"
              value={standardAmount}
              onChange={(e) => setStandardAmount(e.target.value)}
              placeholder="0.00"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="solidarity_amount">Solidarity Fee Amount</Label>
            <Input
              id="solidarity_amount"
              type="number"
              step="0.01"
              value={solidarityAmount}
              onChange={(e) => setSolidarityAmount(e.target.value)}
              placeholder="0.00"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
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
  onSave: (fee: { year_month: string; fee_type: FeeType; amount: number }) => Promise<unknown>;
}) {
  const [standardAmount, setStandardAmount] = useState(fees.standard.toString());
  const [solidarityAmount, setSolidarityAmount] = useState(fees.solidarity.toString());
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      await Promise.all([
        onSave({ year_month: fee.year_month, fee_type: 'standard', amount: parseFloat(standardAmount) || 0 }),
        onSave({ year_month: fee.year_month, fee_type: 'solidarity', amount: parseFloat(solidarityAmount) || 0 }),
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
            Update fees for {format(new Date(fee.year_month), 'MMMM yyyy')}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="edit_standard_amount">Standard Fee Amount</Label>
            <Input
              id="edit_standard_amount"
              type="number"
              step="0.01"
              value={standardAmount}
              onChange={(e) => setStandardAmount(e.target.value)}
              placeholder="0.00"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit_solidarity_amount">Solidarity Fee Amount</Label>
            <Input
              id="edit_solidarity_amount"
              type="number"
              step="0.01"
              value={solidarityAmount}
              onChange={(e) => setSolidarityAmount(e.target.value)}
              placeholder="0.00"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? 'Saving...' : 'Save Changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
