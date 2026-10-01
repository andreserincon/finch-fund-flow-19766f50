-- Cross-currency transfers (pesos <-> dólares) must debit the ORIGIN account in
-- its own currency.
--
-- Background
-- ----------
-- account_transfers had a single `amount`. For a cross-currency transfer the
-- form stored the DESTINATION amount (what arrives), so a pesos -> dólares
-- transfer of $145.000 -> US$100 credited US$100 to Ahorros but debited only
-- $100 (not $145.000) from the pesos account: the egreso was effectively lost.
--
-- Fix
-- ---
-- `amount`        = amount credited to to_account   (destination currency)
-- `source_amount` = amount debited from from_account (origin currency)
-- NULL source_amount means "same as amount" (every same-currency transfer).
ALTER TABLE public.account_transfers
  ADD COLUMN IF NOT EXISTS source_amount numeric;

ALTER TABLE public.account_transfers
  DROP CONSTRAINT IF EXISTS account_transfers_source_amount_positive;
ALTER TABLE public.account_transfers
  ADD CONSTRAINT account_transfers_source_amount_positive
  CHECK (source_amount IS NULL OR source_amount > 0);

-- Backfill existing cross-currency transfers from the conversion note the form
-- has always written: "Converted <origin> to <dest>" / "Convertido <origin> a
-- <dest>". Pesos are formatted es-AR ("$ 145.000,00": dot thousands, comma
-- decimals); dólares en-US ("$1,000.00": comma thousands, dot decimals).
-- Rows whose note can't be parsed keep NULL and should be fixed from
-- "Editar transferencia".
WITH parsed AS (
  SELECT
    id,
    from_account,
    substring(notes FROM '^(?:Converted|Convertido) (.+?) (?:to|a) ') AS origin_txt
  FROM public.account_transfers
  WHERE source_amount IS NULL
    AND ((from_account = 'savings') <> (to_account = 'savings'))
    AND notes ~ '^(Converted|Convertido) '
)
UPDATE public.account_transfers t
SET source_amount = CASE
  WHEN p.from_account = 'savings'
    THEN NULLIF(regexp_replace(p.origin_txt, '[^0-9.]', '', 'g'), '')::numeric
  ELSE NULLIF(replace(regexp_replace(p.origin_txt, '[^0-9,]', '', 'g'), ',', '.'), '')::numeric
END
FROM parsed p
WHERE t.id = p.id
  AND p.origin_txt IS NOT NULL;
