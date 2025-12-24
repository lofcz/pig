import { Config, CompanyDetails, Ruleset } from '../../types';
import { InvoiceDraft } from './types';

export function isBillingMonth(month: number, ruleset: Ruleset): boolean {
  switch (ruleset.periodicity) {
    case 'monthly': return true;
    case 'quarterly': return month % 3 === 0;
    case 'yearly': return month === 12;
    case 'custom_months': return month % (ruleset.periodicityCustomValue || 1) === 0;
    case 'custom_days': return true;
    default: return true;
  }
}

export function getInvoiceLabel(year: number, month: number, ruleset: Ruleset): string {
  const yearShort = year.toString().slice(-2);
  
  switch (ruleset.periodicity) {
    case 'monthly':
      return `${month}/${yearShort}`;
    case 'quarterly':
      const q = Math.ceil(month / 3);
      return `Q${q} ${yearShort}`;
    case 'yearly':
      return `${year}`;
    case 'custom_months':
      const n = ruleset.periodicityCustomValue || 1;
      const startM = month - n + 1;
      const startMStr = startM.toString().padStart(2, '0');
      const endMStr = month.toString().padStart(2, '0');
      return `${startMStr}-${endMStr}/${yearShort}`;
    default:
      return `${month}/${yearShort}`;
  }
}

// Helper to find customer for a draft based on ruleset rules
export function findCustomerForDraft(draft: InvoiceDraft, config: Config): CompanyDetails | undefined {
  const ruleset = config.rulesets.find(r => r.id === draft.rulesetId);
  if (!ruleset) return undefined;
  
  for (const rule of ruleset.rules) {
    let match = false;
    if (rule.condition === 'odd') match = (draft.month % 2 !== 0);
    else if (rule.condition === 'even') match = (draft.month % 2 === 0);
    else if (rule.condition === 'default') match = true;
    
    if (match) {
      const customer = config.companies.find(c => c.id === rule.companyId);
      if (customer) return customer;
    }
  }
  return undefined;
}

// Build invoice template replacements
export function buildInvoiceReplacements(
  supplier: CompanyDetails,
  customer: CompanyDetails,
  invoiceNo: string,
  variableSymbol: string,
  issueDateStr: string,
  dueDateStr: string,
  description: string,
  amountStr: string
): Record<string, string> {
  return {
    '{{P_NO}}': invoiceNo,
    '{{P_ISSUED}}': issueDateStr,
    '{{P_DUZP}}': issueDateStr,
    '{{P_DUE}}': dueDateStr,
    '{{P_VS}}': variableSymbol,
    '{{P_ACC}}': supplier.bankAccount || '',
    '{{P_SUPPLIER}}': [
      supplier.name,
      supplier.street,
      `${supplier.zip}, ${supplier.city}`,
      supplier.country,
      `IČ: ${supplier.ic}`,
      supplier.dic ? `DIČ: ${supplier.dic}` : ''
    ].filter(Boolean).join('\n'),
    '{{P_SUP_NAME}}': supplier.name,
    '{{P_SUP_STREET}}': supplier.street,
    '{{P_SUP_ZIP}}': supplier.zip,
    '{{P_SUP_CITY}}': supplier.city,
    '{{P_SUP_COUNTRY}}': supplier.country,
    '{{P_SUP_IC}}': supplier.ic,
    '{{P_SUP_DIC}}': supplier.dic || '',
    '{{P_CUSTOMER}}': [
      customer.name,
      customer.street,
      `${customer.zip}, ${customer.city}`,
      customer.country,
      `IČ: ${customer.ic}`,
      customer.dic ? `DIČ: ${customer.dic}` : ''
    ].filter(Boolean).join('\n'),
    '{{P_CUST_NAME}}': customer.name,
    '{{P_CUST_STREET}}': customer.street,
    '{{P_CUST_ZIP}}': customer.zip,
    '{{P_CUST_CITY}}': customer.city,
    '{{P_CUST_COUNTRY}}': customer.country,
    '{{P_CUST_IC}}': customer.ic,
    '{{P_CUST_DIC}}': customer.dic || '',
    '{{P_DESC}}': description,
    '{{P_VALUE}}': amountStr,
    '{{P_VAT}}': "0%"
  };
}

export function formatDateCzech(date: Date): string {
  return `${date.getDate()}. ${date.getMonth() + 1}. ${date.getFullYear()}`;
}

export function formatAmountCzech(amount: number): string {
  return amount.toLocaleString('cs-CZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
