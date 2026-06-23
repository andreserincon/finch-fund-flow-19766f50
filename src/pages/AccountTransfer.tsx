import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAccountTransfers } from '@/hooks/useAccountTransfers';
import { useExchangeRate } from '@/hooks/useExchangeRate';
import { TransferList } from '@/components/transfers/TransferList';
import { PageHeader } from '@/components/ui/PageHeader';
import { AccountType, ACCOUNT_LABELS } from '@/lib/types';
import { formatCurrency, getCurrencyForAccount } from '@/lib/utils';
import { ArrowLeft, ArrowLeftRight, ArrowRight, Plus, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';

const makeTransferSchema = (t: TFunction) => z.object({
  transfer_date: z.string().min(1, t('transfer.dateRequired')),
  source_amount: z.number().positive(t('transfer.amountPositive')),
  destination_amount: z.number().positive(t('transfer.amountPositive')),
  from_account: z.enum(['bank', 'great_lodge', 'savings']),
  to_account: z.enum(['bank', 'great_lodge', 'savings']),
  notes: z.string().max(500).optional(),
}).refine(data => data.from_account !== data.to_account, {
  message: t('transfer.differentAccounts'),
  path: ['to_account'],
});

type TransferFormData = z.infer<ReturnType<typeof makeTransferSchema>>;

export default function AccountTransfer() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { addTransfer } = useAccountTransfers();
  const { exchangeRate } = useExchangeRate();
  const [showForm, setShowForm] = useState(false);
  const transferSchema = useMemo(() => makeTransferSchema(t), [t]);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<TransferFormData>({
    resolver: zodResolver(transferSchema),
    defaultValues: {
      transfer_date: new Date().toISOString().split('T')[0],
      from_account: 'bank',
      to_account: 'great_lodge',
      source_amount: 0,
      destination_amount: 0,
    },
  });

  const fromAccount = watch('from_account');
  const toAccount = watch('to_account');
  const sourceAmount = watch('source_amount');
  const destinationAmount = watch('destination_amount');

  // Check if this is a cross-currency transfer
  const fromCurrency = getCurrencyForAccount(fromAccount);
  const toCurrency = getCurrencyForAccount(toAccount);
  const isCrossCurrencyTransfer = fromCurrency !== toCurrency;

  // Calculate implied exchange rate when both amounts are filled
  const impliedRate = sourceAmount && destinationAmount 
    ? (fromCurrency === 'ARS' ? sourceAmount / destinationAmount : destinationAmount / sourceAmount)
    : null;

  const onSubmit = async (data: TransferFormData) => {
    // For cross-currency transfers, record the destination amount (the amount that arrives)
    // The notes will include the conversion details
    const transferAmount = isCrossCurrencyTransfer ? data.destination_amount : data.source_amount;
    
    let notes = data.notes || '';
    if (isCrossCurrencyTransfer) {
      const conversionNote = `Converted ${formatCurrency(data.source_amount, fromCurrency)} to ${formatCurrency(data.destination_amount, toCurrency)}`;
      notes = notes ? `${conversionNote}. ${notes}` : conversionNote;
    }

    await addTransfer.mutateAsync({
      transfer_date: data.transfer_date,
      amount: transferAmount,
      from_account: data.from_account,
      to_account: data.to_account,
      notes: notes || null,
    });
    
    // Reset form and hide it
    reset({
      transfer_date: new Date().toISOString().split('T')[0],
      from_account: 'bank',
      to_account: 'great_lodge',
      source_amount: 0,
      destination_amount: 0,
      notes: '',
    });
    setShowForm(false);
  };

  // Sync amounts when not cross-currency
  const handleSourceAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseFloat(e.target.value) || 0;
    setValue('source_amount', value, { shouldValidate: true });
    if (!isCrossCurrencyTransfer) {
      setValue('destination_amount', value, { shouldValidate: true });
    }
  };

  const handleDestinationAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseFloat(e.target.value) || 0;
    setValue('destination_amount', value, { shouldValidate: true });
    if (!isCrossCurrencyTransfer) {
      setValue('source_amount', value, { shouldValidate: true });
    }
  };

  const handleCancel = () => {
    reset({
      transfer_date: new Date().toISOString().split('T')[0],
      from_account: 'bank',
      to_account: 'great_lodge',
      source_amount: 0,
      destination_amount: 0,
      notes: '',
    });
    setShowForm(false);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-fade-in">
      <PageHeader
        title={t('transfer.title')}
        subtitle={t('transfer.subtitle')}
        hairline
        leading={
          <Link to="/panel">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
        }
        actions={
          !showForm && (
            <Button data-asistente="transfer-nueva" onClick={() => setShowForm(true)}>
              <Plus className="h-4 w-4 mr-2" />
              {t('transfer.newTransfer')}
            </Button>
          )
        }
      />

      {showForm && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="font-display flex items-center gap-2">
                  <ArrowLeftRight className="h-5 w-5 text-primary" />
                  {t('transfer.newTransfer')}
                </CardTitle>
                <CardDescription>
                  {t('transfer.transferFunds')}
                  {isCrossCurrencyTransfer && (
                    <span className="block mt-1 text-warning">
                      {t('transfer.currencyConversion', { from: fromCurrency, to: toCurrency })}
                    </span>
                  )}
                </CardDescription>
              </div>
              <Button variant="ghost" size="icon" onClick={handleCancel}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{t('transfer.fromAccount')}</Label>
                  <Select
                    value={fromAccount}
                    onValueChange={(value: AccountType) => {
                      setValue('from_account', value);
                      // Reset amounts when accounts change
                      if (!isCrossCurrencyTransfer) {
                        setValue('destination_amount', sourceAmount);
                      }
                    }}
                  >
                    <SelectTrigger data-asistente="transfer-origen">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(['bank', 'great_lodge', 'savings'] as AccountType[]).map((acc) => (
                        <SelectItem key={acc} value={acc}>
                          {ACCOUNT_LABELS[acc]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>{t('transfer.toAccount')}</Label>
                  <Select
                    value={toAccount}
                    onValueChange={(value: AccountType) => {
                      setValue('to_account', value);
                      // Reset amounts when accounts change
                      if (!isCrossCurrencyTransfer) {
                        setValue('destination_amount', sourceAmount);
                      }
                    }}
                  >
                    <SelectTrigger data-asistente="transfer-destino">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(['bank', 'great_lodge', 'savings'] as AccountType[]).map((acc) => (
                        <SelectItem key={acc} value={acc}>
                          {ACCOUNT_LABELS[acc]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.to_account && (
                    <p className="text-sm text-destructive">{errors.to_account.message}</p>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="transfer_date">{t('transfer.date')}</Label>
                <Input
                  id="transfer_date"
                  type="date"
                  data-asistente="transfer-fecha"
                  {...register('transfer_date')}
                />
                {errors.transfer_date && (
                  <p className="text-sm text-destructive">{errors.transfer_date.message}</p>
                )}
              </div>

              {isCrossCurrencyTransfer ? (
                <div className="space-y-4">
                  <div className="p-4 rounded-lg bg-muted/50 border border-border">
                    <p className="text-sm font-medium mb-3">{t('transfer.currencyConversionTitle')}</p>
                    <div className="grid grid-cols-1 sm:grid-cols-[1fr,auto,1fr] gap-3 items-end">
                      <div className="space-y-2">
                        <Label htmlFor="source_amount">{t('transfer.amount')} ({fromCurrency})</Label>
                        <Input
                          id="source_amount"
                          type="number"
                          step="0.01"
                          value={sourceAmount || ''}
                          onChange={handleSourceAmountChange}
                          placeholder="0.00"
                        />
                      </div>
                      <ArrowRight className="h-5 w-5 text-muted-foreground mb-2 hidden sm:block" />
                      <div className="space-y-2">
                        <Label htmlFor="destination_amount">{t('transfer.amount')} ({toCurrency})</Label>
                        <Input
                          id="destination_amount"
                          type="number"
                          step="0.01"
                          value={destinationAmount || ''}
                          onChange={handleDestinationAmountChange}
                          placeholder="0.00"
                        />
                      </div>
                    </div>
                    {impliedRate && impliedRate > 0 && (
                      <div className="mt-2 space-y-1">
                        <p className="text-xs text-muted-foreground">
                          {t('transfer.impliedRate', { rate: impliedRate.toFixed(2) })}
                        </p>
                        {exchangeRate > 0 && (
                          <p className="text-xs text-muted-foreground">
                            {t('transfer.currentRate', { rate: exchangeRate.toFixed(2) })}
                          </p>
                        )}
                        {exchangeRate > 0 &&
                          Math.abs(impliedRate - exchangeRate) / exchangeRate > 0.02 && (
                            <p className="text-xs font-medium text-warning">
                              {t('transfer.rateDivergence', { pct: ((Math.abs(impliedRate - exchangeRate) / exchangeRate) * 100).toFixed(1) })}
                            </p>
                          )}
                      </div>
                    )}
                  </div>
                  {(errors.source_amount || errors.destination_amount) && (
                    <p className="text-sm text-destructive">{t('transfer.bothAmountsRequired')}</p>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  <Label htmlFor="source_amount">{t('transfer.amount')} ({fromCurrency})</Label>
                  <Input
                    id="source_amount"
                    type="number"
                    step="0.01"
                    data-asistente="transfer-monto"
                    value={sourceAmount || ''}
                    onChange={handleSourceAmountChange}
                    placeholder="0.00"
                  />
                  {errors.source_amount && (
                    <p className="text-sm text-destructive">{errors.source_amount.message}</p>
                  )}
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="notes">{t('transfer.notesOptional')}</Label>
                <Textarea
                  id="notes"
                  {...register('notes')}
                  placeholder={t('transfer.notesPlaceholder')}
                  rows={3}
                />
                {errors.notes && (
                  <p className="text-sm text-destructive">{errors.notes.message}</p>
                )}
              </div>

              <div className="flex gap-3 pt-4">
                <Button type="button" variant="outline" onClick={handleCancel}>
                  {t('common.cancel')}
                </Button>
                <Button type="submit" data-asistente="transfer-completar" disabled={isSubmitting} className="flex-1">
                  {isSubmitting ? t('common.processing') : t('transfer.completeTransfer')}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Transfer History */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">{t('transfer.transferHistory')}</h2>
        <TransferList />
      </div>
    </div>
  );
}
