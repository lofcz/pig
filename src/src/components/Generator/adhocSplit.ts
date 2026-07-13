import { Config, Ruleset } from '../../types';
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
  /** Numeric base variable symbol, with a zero-padded part suffix when split */
  variableSymbol: string;
  /** Description configured for this generated document */
  description: string;
  /** Display label: `${name}` when unsplit, `${name} Part ${n}/${totalCount}` when split */
  label: string;
  /** True when this invoice was actually split into multiple parts */
  isSplit: boolean;
}

export function normalizeAdhocVariableSymbol(value: string, invoiceNo: string): string {
  const normalizedValue = value.replace(/\D/g, '');
  return normalizedValue || invoiceNo.replace(/\D/g, '');
}

export function getAdhocInvoicePartCount(value: number, ruleset?: Ruleset): number {
  const maxValue = ruleset?.maxInvoiceValue;
  if (!Number.isFinite(value) || value <= 0 || !maxValue || maxValue <= 0 || value <= maxValue) {
    return 1;
  }
  return Math.ceil(value / maxValue);
}

/**
 * Derive the parts of an adhoc invoice, applying the parent ruleset's
 * `maxInvoiceValue` splitting when applicable.
 *
 * Splitting rules:
 * - No `rulesetId`, or the ruleset is missing/has no `maxInvoiceValue`, or the
 *   invoice value is within the max → single unsplit part.
 * - Otherwise: full `maxInvoiceValue` chunks plus a final remainder part.
 *   Invoice numbers receive `/N`; variable symbols remain numeric and receive
 *   a zero-padded `01`, `02`, ... suffix so every part is unique.
 *
 * `minimizeInvoices` carry-forward does NOT apply — adhoc invoices are one-off,
 * so they always fully split when over the max.
 */
export function getAdhocInvoiceParts(inv: AdhocInvoice, config: Config): AdhocInvoicePart[] {
  const ruleset = inv.rulesetId ? config.rulesets.find(r => r.id === inv.rulesetId) : undefined;
  const maxValue = ruleset?.maxInvoiceValue;
  const baseVariableSymbol = normalizeAdhocVariableSymbol(inv.variableSymbol, inv.invoiceNo);
  const totalCount = getAdhocInvoicePartCount(inv.value, ruleset);

  const unsplit = (): AdhocInvoicePart[] => [{
    partIndex: 0,
    totalCount: 1,
    amount: inv.value,
    invoiceNo: inv.invoiceNo,
    variableSymbol: baseVariableSymbol,
    description: inv.partDescriptions?.[0] ?? inv.description,
    label: inv.name,
    isSplit: false,
  }];

  if (totalCount === 1 || !maxValue) {
    return unsplit();
  }

  const fullCount = Math.floor(inv.value / maxValue);
  const remainder = inv.value - fullCount * maxValue;
  const partSuffixWidth = Math.max(2, String(totalCount).length);

  const parts: AdhocInvoicePart[] = [];
  for (let i = 0; i < fullCount; i++) {
    const n = i + 1;
    parts.push({
      partIndex: i,
      totalCount,
      amount: maxValue,
      invoiceNo: `${inv.invoiceNo}/${n}`,
      variableSymbol: `${baseVariableSymbol}${String(n).padStart(partSuffixWidth, '0')}`,
      description: inv.partDescriptions?.[i] ?? inv.description,
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
      variableSymbol: `${baseVariableSymbol}${String(n).padStart(partSuffixWidth, '0')}`,
      description: inv.partDescriptions?.[fullCount] ?? inv.description,
      label: `${inv.name} Part ${n}/${totalCount}`,
      isSplit: true,
    });
  }

  return parts;
}
