import { Config } from '../../types';
import { AdhocInvoice } from './types';

/**
 * A single part of an adhoc invoice after optional ruleset-driven splitting.
 * An unsplit invoice yields exactly one part with `isSplit: false` and the
 * user's original invoiceNo / variableSymbol unchanged.
 */
export interface AdhocInvoicePart {
  /** 0-based part index within the parent adhoc invoice */
  partIndex: number;
  /** Total number of parts (1 when unsplit) */
  totalCount: number;
  amount: number;
  /** Base invoiceNo, or `${base}/${n}` (1-based) when split */
  invoiceNo: string;
  /** Base variableSymbol, or `${base}/${n}` (1-based) when split */
  variableSymbol: string;
  /** Display label: `${name}` when unsplit, `${name} Part ${n}/${totalCount}` when split */
  label: string;
  /** True when this invoice was actually split into multiple parts */
  isSplit: boolean;
}

/**
 * Derive the parts of an adhoc invoice, applying the parent ruleset's
 * `maxInvoiceValue` splitting when applicable.
 *
 * Splitting rules:
 * - No `rulesetId`, or the ruleset is missing/has no `maxInvoiceValue`, or the
 *   invoice value is within the max → single unsplit part.
 * - Otherwise: full `maxInvoiceValue` chunks plus a final remainder part. Each
 *   part's invoiceNo / variableSymbol gets a 1-based `/N` suffix so accounting
 *   numbers stay unique across parts.
 *
 * `minimizeInvoices` carry-forward does NOT apply — adhoc invoices are one-off,
 * so they always fully split when over the max.
 */
export function getAdhocInvoiceParts(inv: AdhocInvoice, config: Config): AdhocInvoicePart[] {
  const ruleset = inv.rulesetId ? config.rulesets.find(r => r.id === inv.rulesetId) : undefined;
  const maxValue = ruleset?.maxInvoiceValue;

  const unsplit = (): AdhocInvoicePart[] => [{
    partIndex: 0,
    totalCount: 1,
    amount: inv.value,
    invoiceNo: inv.invoiceNo,
    variableSymbol: inv.variableSymbol,
    label: inv.name,
    isSplit: false,
  }];

  if (!maxValue || maxValue <= 0 || inv.value <= maxValue) {
    return unsplit();
  }

  const fullCount = Math.floor(inv.value / maxValue);
  const remainder = inv.value - fullCount * maxValue;
  const totalCount = fullCount + (remainder > 0 ? 1 : 0);

  // Defensive: if rounding leaves us with <2 parts, treat as unsplit.
  if (totalCount < 2) {
    return unsplit();
  }

  const parts: AdhocInvoicePart[] = [];
  for (let i = 0; i < fullCount; i++) {
    const n = i + 1;
    parts.push({
      partIndex: i,
      totalCount,
      amount: maxValue,
      invoiceNo: `${inv.invoiceNo}/${n}`,
      variableSymbol: `${inv.variableSymbol}/${n}`,
      label: `${inv.name} Part ${n}/${totalCount}`,
      isSplit: true,
    });
  }

  if (remainder > 0) {
    const n = fullCount + 1;
    parts.push({
      partIndex: fullCount,
      totalCount,
      amount: Math.round(remainder * 100) / 100,
      invoiceNo: `${inv.invoiceNo}/${n}`,
      variableSymbol: `${inv.variableSymbol}/${n}`,
      label: `${inv.name} Part ${n}/${totalCount}`,
      isSplit: true,
    });
  }

  return parts;
}
