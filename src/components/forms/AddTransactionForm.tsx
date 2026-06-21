/**
 * @file AddTransactionForm.tsx
 * @description Unified "Registrar movimiento" dialog. A single entry point for
 *   every money movement: a top "Tipo de movimiento" selector switches the form
 *   body and routes to the correct save path:
 *     - Ingreso / Gasto  -> addTransaction (income/expense, with categories)
 *     - Transferencia     -> addTransfer (between accounts, cross-currency aware)
 *     - Pago de prestamo  -> addLoanPayment (records against a specific loan)
 *   All copy is Spanish (the app is Spanish-only).
 */
import { useState, useEffect, useRef, ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { useTransactions } from '@/hooks/useTransactions';
import { useMembers } from '@/hooks/useMembers';
import { useMonthlyFees } from '@/hooks/useMonthlyFees';
import { useExtraordinaryExpenses } from '@/hooks/useExtraordinaryExpenses';
import { useEventMemberPayments } from '@/hooks/useEventMemberPayments';
import { useAccountTransfers } from '@/hooks/useAccountTransfers';
import { useLoans } from '@/hooks/useLoans';
import { useExchangeRate } from '@/hooks/useExchangeRate';
import {
  TransactionType, TransactionCategory, CATEGORY_LABELS, AccountType, ACCOUNT_LABELS,
} from '@/lib/types';
import { formatCurrency, getCurrencyForAccount, parseLocalDate, cn } from '@/lib/utils';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { PlusCircle, ArrowRight } from 'lucide-react';

const ACCOUNTS: AccountType[] = ['bank', 'great_lodge', 'savings'];
const today = () => new Date().toISOString().split('T')[0];

type Modo = 'ingreso' | 'gasto' | 'evento' | 'transferencia' | 'prestamo';

const MODOS: { key: Modo; label: string }[] = [
  { key: 'ingreso', label: 'Ingreso' },
  { key: 'gasto', label: 'Gasto' },
  { key: 'evento', label: 'Evento' },
  { key: 'transferencia', label: 'Transferencia' },
  { key: 'prestamo', label: 'Préstamo' },
];

/* ---- income/expense schema (the original transaction form) ---- */
const EVENT_CATEGORIES: TransactionCategory[] = ['event_expense', 'event_payment'];

const transactionSchema = z
  .object({
    transaction_date: z.string().min(1, 'La fecha es obligatoria'),
    amount: z.number().positive('El monto debe ser positivo'),
    transaction_type: z.enum(['income', 'expense']),
    category: z.enum([
      'monthly_fee', 'extraordinary_income', 'donation', 'reimbursement', 'event_expense',
      'parent_organization_fee', 'other_expense', 'other_income', 'event_payment',
      'loan_disbursement', 'loan_repayment', 'account_yield',
    ]),
    account: z.enum(['bank', 'great_lodge', 'savings']),
    member_id: z.string().optional(),
    event_id: z.string().optional(),
    event_member_payment_id: z.string().optional(),
    expense_summary: z.string().max(40, 'Máximo 40 caracteres').optional(),
    notes: z.string().max(500).optional(),
  })
  .refine((d) => !EVENT_CATEGORIES.includes(d.category) || !!d.event_id, { path: ['event_id'], message: 'Seleccioná un evento' })
  .refine((d) => d.category !== 'event_payment' || !!d.event_member_payment_id, { path: ['event_member_payment_id'], message: 'Seleccioná el participante' });

type TransactionFormData = z.infer<typeof transactionSchema>;

interface AddTransactionFormProps {
  defaultType?: TransactionType;
  triggerLabel?: string;
  /** Custom trigger element (e.g. the mobile bottom-nav + button). */
  trigger?: ReactNode;
}

export function AddTransactionForm({ defaultType = 'income', triggerLabel = 'Registrar movimiento', trigger }: AddTransactionFormProps) {
  const [open, setOpen] = useState(false);
  const [modo, setModo] = useState<Modo>(defaultType === 'expense' ? 'gasto' : 'ingreso');
  const addAnotherRef = useRef(false);

  const { addTransaction } = useTransactions();
  const { addTransfer } = useAccountTransfers();
  const { loans, addLoanPayment } = useLoans();
  const { members } = useMembers();
  const { currentMonthFees } = useMonthlyFees();
  const { expenses: events } = useExtraordinaryExpenses();
  const { exchangeRate } = useExchangeRate();
  const activeEvents = events.filter((e) => e.is_active);
  const activeLoans = loans.filter((l) => l.status === 'active');

  /* ================= Ingreso / Gasto (react-hook-form) ================= */
  // Event categories live in the dedicated "Evento" tab, not here.
  const incomeCategories: TransactionCategory[] = [
    'monthly_fee', 'extraordinary_income', 'donation', 'reimbursement', 'other_income', 'account_yield',
  ];
  const expenseCategories: TransactionCategory[] = ['parent_organization_fee', 'other_expense'];

  const {
    register, handleSubmit, setValue, watch, reset,
    formState: { errors, isSubmitting },
  } = useForm<TransactionFormData>({
    resolver: zodResolver(transactionSchema),
    defaultValues: {
      transaction_type: defaultType,
      category: defaultType === 'income' ? 'monthly_fee' : 'other_expense',
      transaction_date: today(),
      account: 'bank',
    },
  });

  const transactionType = watch('transaction_type');
  const category = watch('category');
  const selectedAccount = watch('account');
  const selectedEventId = watch('event_id');
  const selectedParticipantId = watch('event_member_payment_id');
  const expenseSummary = watch('expense_summary');
  const isEventCategory = EVENT_CATEGORIES.includes(category);
  const isEventPayment = category === 'event_payment';
  const isEventExpense = category === 'event_expense';
  const supportsSummary = category === 'event_expense' || category === 'other_expense';

  const { payments: eventParticipants } = useEventMemberPayments(isEventPayment ? selectedEventId : undefined);

  useEffect(() => {
    if (category === 'monthly_fee' && currentMonthFees.standard > 0) setValue('amount', currentMonthFees.standard);
    else setValue('amount', 0);
  }, [category, currentMonthFees.standard, setValue]);
  useEffect(() => { if (!isEventCategory && selectedEventId) setValue('event_id', undefined); }, [isEventCategory, selectedEventId, setValue]);
  useEffect(() => { if (!isEventPayment && selectedParticipantId) setValue('event_member_payment_id', undefined); }, [isEventPayment, selectedParticipantId, setValue]);
  useEffect(() => { setValue('event_member_payment_id', undefined); }, [selectedEventId, setValue]);
  useEffect(() => { if (!supportsSummary) setValue('expense_summary', undefined); }, [supportsSummary, setValue]);
  useEffect(() => {
    if (!isEventCategory || !selectedEventId) return;
    const evt = activeEvents.find((e) => e.id === selectedEventId);
    if (evt && evt.default_amount > 0) setValue('amount', evt.default_amount);
  }, [selectedEventId, isEventCategory, activeEvents, setValue]);
  useEffect(() => {
    if (!isEventPayment || !selectedParticipantId) return;
    const p = eventParticipants.find((row) => row.id === selectedParticipantId);
    if (!p) return;
    const balance = Number(p.amount_owed) - Number(p.amount_paid);
    if (balance > 0) setValue('amount', balance);
  }, [selectedParticipantId, isEventPayment, eventParticipants, setValue]);

  const availableCategories = transactionType === 'income' ? incomeCategories : expenseCategories;

  // Participant picker for event payments: only those who still owe something
  // (hide anyone already fully paid), sorted alphabetically by name. .filter
  // returns a new array, so the following .sort never mutates the cached data.
  const eventParticipantOptions = eventParticipants
    .filter((p) => Number(p.amount_owed) - Number(p.amount_paid) > 0)
    .sort((a, b) => {
      const an = a.member?.full_name || a.guest_name || '';
      const bn = b.member?.full_name || b.guest_name || '';
      return an.localeCompare(bn, 'es');
    });

  // Keep transaction_type in sync with the Ingreso/Gasto selector
  const switchModo = (next: Modo) => {
    setModo(next);
    if (next === 'ingreso') {
      setValue('transaction_type', 'income');
      setValue('category', 'monthly_fee');
    } else if (next === 'gasto') {
      setValue('transaction_type', 'expense');
      setValue('category', 'other_expense');
    } else if (next === 'evento') {
      setValue('transaction_type', 'income');
      setValue('category', 'event_payment');
    }
  };

  const onSubmitTransaction = async (data: TransactionFormData) => {
    let memberIdToSend: string | null | undefined = data.member_id || null;
    let participantIdToSend: string | null = null;
    if (data.category === 'event_payment' && data.event_member_payment_id) {
      const p = eventParticipants.find((row) => row.id === data.event_member_payment_id);
      participantIdToSend = data.event_member_payment_id;
      memberIdToSend = p?.member_id ?? null;
    }
    await addTransaction.mutateAsync({
      transaction_date: data.transaction_date,
      amount: data.amount,
      transaction_type: data.transaction_type,
      category: data.category,
      account: data.account,
      member_id: memberIdToSend ?? null,
      event_id: EVENT_CATEGORIES.includes(data.category) ? data.event_id || null : null,
      event_member_payment_id: participantIdToSend,
      expense_summary: (data.category === 'event_expense' || data.category === 'other_expense') ? data.expense_summary?.trim() || null : null,
      notes: data.notes || null,
    });
    finishOrReset(() => reset({
      transaction_type: data.transaction_type,
      category: modo === 'evento' ? data.category : (data.transaction_type === 'income' ? 'monthly_fee' : 'other_expense'),
      transaction_date: data.transaction_date,
      account: data.account,
    }));
  };

  /* ===================== Transferencia (local state) ===================== */
  const [tDate, setTDate] = useState(today());
  const [tFrom, setTFrom] = useState<AccountType>('bank');
  const [tTo, setTTo] = useState<AccountType>('great_lodge');
  const [tSource, setTSource] = useState('');
  const [tDest, setTDest] = useState('');
  const [tNotes, setTNotes] = useState('');
  const [tSubmitting, setTSubmitting] = useState(false);
  const fromCurrency = getCurrencyForAccount(tFrom);
  const toCurrency = getCurrencyForAccount(tTo);
  const isCross = fromCurrency !== toCurrency;
  const source = parseFloat(tSource) || 0;
  const dest = parseFloat(tDest) || 0;
  const impliedRate = source && dest ? (fromCurrency === 'ARS' ? source / dest : dest / source) : null;
  const rateDiverges = !!impliedRate && exchangeRate > 0 && Math.abs(impliedRate - exchangeRate) / exchangeRate > 0.02;

  const resetTransfer = () => { setTDate(today()); setTFrom('bank'); setTTo('great_lodge'); setTSource(''); setTDest(''); setTNotes(''); };

  const onSubmitTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (tFrom === tTo || source <= 0 || (isCross && dest <= 0)) return;
    setTSubmitting(true);
    try {
      const amount = isCross ? dest : source;
      let notes = tNotes.trim();
      if (isCross) {
        const conv = `Convertido ${formatCurrency(source, fromCurrency)} a ${formatCurrency(dest, toCurrency)}`;
        notes = notes ? `${conv}. ${notes}` : conv;
      }
      await addTransfer.mutateAsync({ transfer_date: tDate, amount, from_account: tFrom, to_account: tTo, notes: notes || null });
      finishOrReset(resetTransfer);
    } finally {
      setTSubmitting(false);
    }
  };

  /* ===================== Pago de préstamo (local state) ===================== */
  const [lLoanId, setLLoanId] = useState('');
  const [lDate, setLDate] = useState(today());
  const [lAmount, setLAmount] = useState('');
  const [lSubmitting, setLSubmitting] = useState(false);
  const selectedLoan = activeLoans.find((l) => l.id === lLoanId);
  const loanCurrency = selectedLoan ? getCurrencyForAccount(selectedLoan.account) : 'ARS';
  const loanRemaining = selectedLoan ? selectedLoan.amount - selectedLoan.amount_paid : 0;
  const loanPaidPct = selectedLoan ? (selectedLoan.amount_paid / selectedLoan.amount) * 100 : 0;

  const resetLoan = () => { setLLoanId(''); setLDate(today()); setLAmount(''); };

  const onSubmitLoan = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = parseFloat(lAmount);
    if (!selectedLoan || isNaN(amount) || amount <= 0) return;
    setLSubmitting(true);
    try {
      await addLoanPayment.mutateAsync({ loanId: selectedLoan.id, paymentAmount: amount, paymentDate: lDate });
      finishOrReset(resetLoan);
    } finally {
      setLSubmitting(false);
    }
  };

  /* ---- shared: close the dialog, or reset to log another ---- */
  const finishOrReset = (resetFn: () => void) => {
    if (addAnotherRef.current) resetFn();
    else setOpen(false);
  };

  const footer = (submitting: boolean, disabled = false) => (
    <DialogFooter className="flex flex-col-reverse gap-2 sm:flex-row sm:flex-wrap sm:justify-end sm:space-x-0">
      <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
      <Button type="submit" variant="outline" disabled={submitting || disabled} onClick={() => { addAnotherRef.current = true; }}>
        Registrar y otro
      </Button>
      <Button type="submit" disabled={submitting || disabled} onClick={() => { addAnotherRef.current = false; }}>
        {submitting ? 'Registrando...' : 'Registrar movimiento'}
      </Button>
    </DialogFooter>
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button className="press">
            <PlusCircle className="mr-2 h-4 w-4" />
            {triggerLabel}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[520px] max-h-[88vh] overflow-y-auto overflow-x-hidden">
        <DialogHeader>
          <DialogTitle className="font-display">Registrar movimiento</DialogTitle>
          <DialogDescription>Elegí el tipo de movimiento y completá los datos.</DialogDescription>
        </DialogHeader>

        {/* Tipo de movimiento selector */}
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-1 rounded-lg bg-muted p-1">
          {MODOS.map((m) => (
            <button
              key={m.key}
              type="button"
              onClick={() => switchModo(m.key)}
              className={cn(
                'press rounded-md px-1.5 py-1.5 text-[11px] font-semibold leading-tight transition-colors',
                modo === m.key ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {m.label}
            </button>
          ))}
        </div>

        {/* ---------- Ingreso / Gasto / Evento ---------- */}
        {(modo === 'ingreso' || modo === 'gasto' || modo === 'evento') && (
          <form onSubmit={handleSubmit(onSubmitTransaction)} className="space-y-3">
            {modo === 'evento' && (
              <div className="space-y-2">
                <Label>Tipo de movimiento del evento</Label>
                <div className="flex gap-1.5 rounded-lg bg-muted p-1">
                  <button
                    type="button"
                    onClick={() => { setValue('transaction_type', 'income'); setValue('category', 'event_payment'); }}
                    className={cn('press flex-1 rounded-md px-2 py-1.5 text-xs font-semibold transition-colors', category === 'event_payment' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}
                  >
                    Cobro a participante
                  </button>
                  <button
                    type="button"
                    onClick={() => { setValue('transaction_type', 'expense'); setValue('category', 'event_expense'); }}
                    className={cn('press flex-1 rounded-md px-2 py-1.5 text-xs font-semibold transition-colors', category === 'event_expense' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}
                  >
                    Gasto del evento
                  </button>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className={cn('space-y-2', modo === 'evento' && 'sm:col-span-2')}>
                <Label>Cuenta</Label>
                <Select value={selectedAccount} onValueChange={(v: AccountType) => setValue('account', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ACCOUNTS.map((acc) => <SelectItem key={acc} value={acc}>{ACCOUNT_LABELS[acc]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {modo !== 'evento' && (
                <div className="space-y-2">
                  <Label>Categoría</Label>
                  <Select value={category} onValueChange={(v: TransactionCategory) => setValue('category', v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {availableCategories.map((cat) => <SelectItem key={cat} value={cat}>{CATEGORY_LABELS[cat]}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="transaction_date">Fecha</Label>
                <Input id="transaction_date" type="date" {...register('transaction_date')} />
                {errors.transaction_date && <p className="text-sm text-destructive">{errors.transaction_date.message}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="amount">Monto ({selectedAccount === 'savings' ? 'USD' : 'ARS'})</Label>
                <Input id="amount" type="number" step="0.01" {...register('amount', { valueAsNumber: true })} placeholder="0.00" />
                {errors.amount && <p className="text-sm text-destructive">{errors.amount.message}</p>}
              </div>
            </div>

            {category === 'monthly_fee' && (
              <div className="space-y-2">
                <Label>Miembro</Label>
                <Select value={watch('member_id') || ''} onValueChange={(v) => setValue('member_id', v || undefined)}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar miembro..." /></SelectTrigger>
                  <SelectContent>
                    {members.map((m) => <SelectItem key={m.id} value={m.id}>{m.full_name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}

            {isEventCategory && (
              <div className="space-y-2">
                <Label>Evento</Label>
                <Select value={selectedEventId || ''} onValueChange={(v) => setValue('event_id', v || undefined, { shouldValidate: true })}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar evento..." /></SelectTrigger>
                  <SelectContent>
                    {activeEvents.length === 0 && <div className="px-2 py-1.5 text-sm text-muted-foreground">No hay eventos activos</div>}
                    {activeEvents.map((evt) => <SelectItem key={evt.id} value={evt.id}>{evt.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                {errors.event_id && <p className="text-sm text-destructive">{errors.event_id.message}</p>}
              </div>
            )}

            {supportsSummary && (!isEventExpense || selectedEventId) && (
              <div className="space-y-2">
                <Label htmlFor="expense_summary">
                  Resumen breve del gasto
                  <span className="text-xs text-muted-foreground ml-1">({(expenseSummary?.length ?? 0)}/40)</span>
                </Label>
                <Input id="expense_summary" {...register('expense_summary')} maxLength={40}
                  placeholder={isEventExpense ? 'Ej: Catering bebidas y mozo' : 'Ej: Compra papelería oficina'} />
                {errors.expense_summary && <p className="text-sm text-destructive">{errors.expense_summary.message}</p>}
              </div>
            )}

            {isEventPayment && selectedEventId && (
              <div className="space-y-2">
                <Label>Participante (miembro o invitado)</Label>
                <Select value={selectedParticipantId || ''} onValueChange={(v) => setValue('event_member_payment_id', v || undefined, { shouldValidate: true })}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar participante..." /></SelectTrigger>
                  <SelectContent>
                    {eventParticipantOptions.length === 0 && (
                      <div className="px-2 py-1.5 text-sm text-muted-foreground">
                        {eventParticipants.length === 0
                          ? 'Este evento no tiene participantes asignados todavía.'
                          : 'Todos los participantes ya pagaron.'}
                      </div>
                    )}
                    {eventParticipantOptions.map((p) => {
                      const name = p.member?.full_name || p.guest_name || 'Sin nombre';
                      const tag = p.member_id ? 'Miembro' : 'Invitado';
                      const balance = Number(p.amount_owed) - Number(p.amount_paid);
                      return <SelectItem key={p.id} value={p.id}>{name} ({tag}) - saldo {balance.toFixed(2)}</SelectItem>;
                    })}
                  </SelectContent>
                </Select>
                {errors.event_member_payment_id && <p className="text-sm text-destructive">{errors.event_member_payment_id.message}</p>}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="notes">{supportsSummary ? 'Descripción detallada del gasto (opcional)' : 'Notas (opcional)'}</Label>
              <Textarea id="notes" {...register('notes')} rows={2}
                placeholder={supportsSummary ? 'Detalle completo del gasto, proveedor, condiciones...' : 'Detalles adicionales...'} />
            </div>

            {footer(isSubmitting)}
          </form>
        )}

        {/* ---------- Transferencia entre cuentas ---------- */}
        {modo === 'transferencia' && (
          <form onSubmit={onSubmitTransfer} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-[1fr,auto,1fr] gap-3 items-end">
              <div className="space-y-2">
                <Label>Cuenta origen</Label>
                <Select value={tFrom} onValueChange={(v: AccountType) => setTFrom(v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{ACCOUNTS.map((a) => <SelectItem key={a} value={a}>{ACCOUNT_LABELS[a]}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <ArrowRight className="h-5 w-5 text-muted-foreground mb-2 hidden sm:block" />
              <div className="space-y-2">
                <Label>Cuenta destino</Label>
                <Select value={tTo} onValueChange={(v: AccountType) => setTTo(v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{ACCOUNTS.map((a) => <SelectItem key={a} value={a}>{ACCOUNT_LABELS[a]}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            {tFrom === tTo && <p className="text-sm text-destructive">Las cuentas origen y destino deben ser diferentes.</p>}

            {isCross ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="t_source">Monto origen ({fromCurrency})</Label>
                  <Input id="t_source" type="number" step="0.01" value={tSource} onChange={(e) => setTSource(e.target.value)} placeholder="0.00" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="t_dest">Monto destino ({toCurrency})</Label>
                  <Input id="t_dest" type="number" step="0.01" value={tDest} onChange={(e) => setTDest(e.target.value)} placeholder="0.00" />
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="t_source">Monto ({fromCurrency})</Label>
                <Input id="t_source" type="number" step="0.01" value={tSource} onChange={(e) => setTSource(e.target.value)} placeholder="0.00" />
              </div>
            )}

            {isCross && impliedRate && impliedRate > 0 && (
              <div className="space-y-1 text-xs">
                <p className="text-muted-foreground">Tasa implícita: <span className="font-mono">1 USD = {impliedRate.toFixed(2)} ARS</span></p>
                {exchangeRate > 0 && <p className="text-muted-foreground">Tasa actual: <span className="font-mono">1 USD = {exchangeRate.toFixed(2)} ARS</span></p>}
                {rateDiverges && (
                  <p className="font-medium text-warning">
                    La tasa implícita difiere de la actual en {((Math.abs(impliedRate - exchangeRate) / exchangeRate) * 100).toFixed(1)}%. Confirmá que es intencional.
                  </p>
                )}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="t_date">Fecha</Label>
              <Input id="t_date" type="date" value={tDate} onChange={(e) => setTDate(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="t_notes">Notas (opcional)</Label>
              <Textarea id="t_notes" rows={3} value={tNotes} onChange={(e) => setTNotes(e.target.value)} placeholder="Motivo de la transferencia..." />
            </div>

            {footer(tSubmitting, tFrom === tTo || source <= 0 || (isCross && dest <= 0))}
          </form>
        )}

        {/* ---------- Pago de préstamo ---------- */}
        {modo === 'prestamo' && (
          <form onSubmit={onSubmitLoan} className="space-y-4">
            <div className="space-y-2">
              <Label>Préstamo</Label>
              <Select value={lLoanId} onValueChange={(v) => { setLLoanId(v); const ln = activeLoans.find((l) => l.id === v); if (ln) setLAmount((ln.amount - ln.amount_paid).toString()); }}>
                <SelectTrigger><SelectValue placeholder="Seleccionar préstamo activo..." /></SelectTrigger>
                <SelectContent>
                  {activeLoans.length === 0 && <div className="px-2 py-1.5 text-sm text-muted-foreground">No hay préstamos activos.</div>}
                  {activeLoans.map((l) => {
                    const cur = getCurrencyForAccount(l.account);
                    const rem = l.amount - l.amount_paid;
                    return <SelectItem key={l.id} value={l.id}>{l.member?.full_name || 'Sin nombre'} - saldo {formatCurrency(rem, cur)}</SelectItem>;
                  })}
                </SelectContent>
              </Select>
            </div>

            {selectedLoan && (
              <div className="p-4 rounded-lg bg-muted space-y-3">
                <div>
                  <p className="font-medium">{selectedLoan.member?.full_name}</p>
                  <p className="text-sm text-muted-foreground">
                    {ACCOUNT_LABELS[selectedLoan.account]} • {format(parseLocalDate(selectedLoan.loan_date), "d 'de' MMM yyyy", { locale: es })}
                  </p>
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between text-sm"><span className="text-muted-foreground">Progreso</span><span className="font-medium">{loanPaidPct.toFixed(0)}%</span></div>
                  <Progress value={loanPaidPct} className="h-2" />
                </div>
                <div className="pt-1 border-t">
                  <p className="text-xs text-muted-foreground">Saldo pendiente</p>
                  <p className="text-lg font-mono font-bold text-warning">{formatCurrency(loanRemaining, loanCurrency)}</p>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="l_date">Fecha del pago</Label>
                <Input id="l_date" type="date" value={lDate} onChange={(e) => setLDate(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="l_amount">Monto del pago</Label>
                  {selectedLoan && (
                    <Button type="button" variant="link" size="sm" className="h-auto p-0 text-xs" onClick={() => setLAmount(loanRemaining.toString())}>
                      Pagar saldo completo
                    </Button>
                  )}
                </div>
                <Input id="l_amount" type="number" step="0.01" min="0.01" max={loanRemaining || undefined}
                  value={lAmount} onChange={(e) => setLAmount(e.target.value)} placeholder="0.00" required />
              </div>
            </div>

            {footer(lSubmitting, !selectedLoan || !lAmount || parseFloat(lAmount) <= 0)}
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
