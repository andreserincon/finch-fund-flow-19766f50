/**
 * @file BudgetMatrixEditor.tsx
 * @description Editable 12-month matrix. Rows are grouped by
 *   (account × transaction_type) into sections; inside each section the
 *   rows are transaction categories. Each row spans 12 month columns
 *   plus a row-total column. A footer row sums each month.
 *
 *   Cells save on blur (debounced via React's natural blur event) by
 *   calling the `upsertLine` mutation from useBudgetLines. Empty input
 *   is treated as 0 and not persisted until edited.
 *
 *   For Phase 1 only categories whose default type matches the section
 *   are rendered. A future "Add row" action can surface opposite-type
 *   categories for edge cases (e.g. an account_yield that is a fee).
 */

import { useMemo, useState } from 'react';
import { cn, formatCurrencyCompact, getCurrencyForAccount } from '@/lib/utils';
import {
  ACCOUNT_LABELS,
  CATEGORY_LABELS,
  type AccountType,
  type TransactionCategory,
  type TransactionType,
} from '@/lib/types';
import {
  BUDGET_MONTHS,
  CATEGORY_DEFAULT_TYPE,
  MONTH_SHORT_LABELS_ES,
  budgetLineKey,
} from '@/lib/budget-types';
import { useBudgetLines } from '@/hooks/useBudgetLines';

/** Accounts rendered as row groups. */
const ACCOUNTS: ReadonlyArray<AccountType> = ['bank', 'great_lodge', 'savings'];
/** Transaction-type subsections within each account. */
const TYPES: ReadonlyArray<TransactionType> = ['income', 'expense'];
const TYPE_LABELS: Record<TransactionType, string> = {
  income: 'Ingresos',
  expense: 'Gastos',
};

interface BudgetMatrixEditorProps {
  scenarioId: string;
  /** When true, cells render as read-only numbers (no input). */
  readOnly?: boolean;
}

export function BudgetMatrixEditor({ scenarioId, readOnly = false }: BudgetMatrixEditorProps) {
  const { linesByKey, isLoading, upsertLine } = useBudgetLines(scenarioId);
  /** Local draft values keyed by cell; cleared on successful save. */
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  /**
   * Categories shown under each (account × type) section. For Phase 1 we
   * include every category whose "natural" direction matches the section.
   * This keeps the grid compact and avoids the 6-accounts × 12-categories
   * × 12-months sprawl that would result from showing every combo.
   */
  const categoriesByType = useMemo<Record<TransactionType, TransactionCategory[]>>(() => {
    const grouped: Record<TransactionType, TransactionCategory[]> = {
      income: [],
      expense: [],
    };
    (Object.entries(CATEGORY_DEFAULT_TYPE) as [
      TransactionCategory,
      TransactionType,
    ][]).forEach(([category, type]) => {
      grouped[type].push(category);
    });
    return grouped;
  }, []);

  const getCellValue = (
    month: number,
    account: AccountType,
    type: TransactionType,
    category: TransactionCategory,
  ): string => {
    const key = budgetLineKey(month, account, type, category);
    if (drafts[key] !== undefined) return drafts[key];
    const line = linesByKey.get(key);
    if (!line) return '';
    return line.budgeted_amount === 0 ? '' : String(line.budgeted_amount);
  };

  const rowTotal = (
    account: AccountType,
    type: TransactionType,
    category: TransactionCategory,
  ): number => {
    let sum = 0;
    for (const m of BUDGET_MONTHS) {
      const key = budgetLineKey(m, account, type, category);
      const draft = drafts[key];
      const v =
        draft !== undefined
          ? Number(draft) || 0
          : linesByKey.get(key)?.budgeted_amount ?? 0;
      sum += v;
    }
    return sum;
  };

  const columnTotal = (
    month: number,
    account: AccountType,
    type: TransactionType,
  ): number => {
    let sum = 0;
    for (const cat of categoriesByType[type]) {
      const key = budgetLineKey(month, account, type, cat);
      const draft = drafts[key];
      const v =
        draft !== undefined
          ? Number(draft) || 0
          : linesByKey.get(key)?.budgeted_amount ?? 0;
      sum += v;
    }
    return sum;
  };

  const handleBlur = async (
    month: number,
    account: AccountType,
    type: TransactionType,
    category: TransactionCategory,
  ) => {
    const key = budgetLineKey(month, account, type, category);
    const draft = drafts[key];
    if (draft === undefined) return;

    const parsed = Number(draft);
    const amount = Number.isFinite(parsed) ? parsed : 0;
    const existing = linesByKey.get(key);

    // No-op if nothing actually changed.
    if (existing?.budgeted_amount === amount) {
      setDrafts((d) => {
        const { [key]: _removed, ...rest } = d;
        return rest;
      });
      return;
    }

    try {
      await upsertLine.mutateAsync({
        budget_scenario_id: scenarioId,
        month,
        account,
        transaction_type: type,
        category,
        budgeted_amount: amount,
      });
      setDrafts((d) => {
        const { [key]: _removed, ...rest } = d;
        return rest;
      });
    } catch {
      // Error toast is fired by the mutation hook; keep the draft so the
      // user can retry without losing their input.
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        Cargando celdas...
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {ACCOUNTS.map((account) => {
        const currency = getCurrencyForAccount(account);
        return (
          <div key={account} className="rounded-lg border bg-card">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <div>
                <h3 className="text-base font-semibold">
                  {ACCOUNT_LABELS[account]}
                </h3>
                <p className="text-xs text-muted-foreground">
                  Moneda: {currency}
                </p>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40">
                    <th className="sticky left-0 z-10 min-w-[180px] bg-muted/40 px-3 py-2 text-left font-medium text-muted-foreground">
                      Categoría
                    </th>
                    {BUDGET_MONTHS.map((m) => (
                      <th
                        key={m}
                        className="px-2 py-2 text-right font-medium text-muted-foreground"
                      >
                        {MONTH_SHORT_LABELS_ES[m]}
                      </th>
                    ))}
                    <th className="px-3 py-2 text-right font-semibold">
                      Total
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {TYPES.map((type) => (
                    <TypeSection
                      key={type}
                      account={account}
                      type={type}
                      categories={categoriesByType[type]}
                      getCellValue={getCellValue}
                      setDraft={(key, val) =>
                        setDrafts((d) => ({ ...d, [key]: val }))
                      }
                      handleBlur={handleBlur}
                      rowTotal={rowTotal}
                      columnTotal={columnTotal}
                      currency={currency}
                      readOnly={readOnly}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ---------------------------------------------------------------- */
/*  Per-(account × type) section                                    */
/* ---------------------------------------------------------------- */

interface TypeSectionProps {
  account: AccountType;
  type: TransactionType;
  categories: TransactionCategory[];
  getCellValue: (
    month: number,
    account: AccountType,
    type: TransactionType,
    category: TransactionCategory,
  ) => string;
  setDraft: (key: string, val: string) => void;
  handleBlur: (
    month: number,
    account: AccountType,
    type: TransactionType,
    category: TransactionCategory,
  ) => void;
  rowTotal: (
    account: AccountType,
    type: TransactionType,
    category: TransactionCategory,
  ) => number;
  columnTotal: (
    month: number,
    account: AccountType,
    type: TransactionType,
  ) => number;
  currency: 'ARS' | 'USD';
  readOnly: boolean;
}

function TypeSection({
  account,
  type,
  categories,
  getCellValue,
  setDraft,
  handleBlur,
  rowTotal,
  columnTotal,
  currency,
  readOnly,
}: TypeSectionProps) {
  const isIncome = type === 'income';
  return (
    <>
      <tr className="border-b">
        <td
          colSpan={BUDGET_MONTHS.length + 2}
          className={cn(
            'sticky left-0 z-10 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide',
            isIncome
              ? 'bg-success/5 text-success'
              : 'bg-overdue/5 text-overdue',
          )}
        >
          {TYPE_LABELS[type]}
        </td>
      </tr>
      {categories.map((category) => (
        <tr key={category} className="border-b hover:bg-muted/20">
          <td className="sticky left-0 z-10 bg-background px-3 py-1.5 text-left">
            {CATEGORY_LABELS[category]}
          </td>
          {BUDGET_MONTHS.map((m) => {
            const key = budgetLineKey(m, account, type, category);
            const value = getCellValue(m, account, type, category);
            return (
              <td key={m} className="px-1 py-1 text-right">
                {readOnly ? (
                  <span className="font-mono text-xs">
                    {value ? formatCurrencyCompact(Number(value), currency) : '—'}
                  </span>
                ) : (
                  <input
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    value={value}
                    placeholder="0"
                    onChange={(e) => setDraft(key, e.target.value)}
                    onBlur={() => handleBlur(m, account, type, category)}
                    className={cn(
                      'w-24 rounded border border-input bg-background px-2 py-1 text-right font-mono text-xs',
                      'focus:outline-none focus:ring-1 focus:ring-ring',
                    )}
                  />
                )}
              </td>
            );
          })}
          <td
            className={cn(
              'px-3 py-1.5 text-right font-mono text-xs font-semibold',
              isIncome ? 'amount-positive' : 'amount-negative',
            )}
          >
            {formatCurrencyCompact(
              rowTotal(account, type, category),
              currency,
            )}
          </td>
        </tr>
      ))}
      {/* Section totals row */}
      <tr className="border-b bg-muted/30">
        <td className="sticky left-0 z-10 bg-muted/30 px-3 py-1.5 text-right text-xs font-semibold">
          Total {TYPE_LABELS[type].toLowerCase()}
        </td>
        {BUDGET_MONTHS.map((m) => (
          <td key={m} className="px-2 py-1.5 text-right font-mono text-xs font-semibold">
            {formatCurrencyCompact(columnTotal(m, account, type), currency)}
          </td>
        ))}
        <td
          className={cn(
            'px-3 py-1.5 text-right font-mono text-xs font-bold',
            isIncome ? 'amount-positive' : 'amount-negative',
          )}
        >
          {formatCurrencyCompact(
            categories.reduce(
              (sum, cat) => sum + rowTotal(account, type, cat),
              0,
            ),
            currency,
          )}
        </td>
      </tr>
    </>
  );
}
