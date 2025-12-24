export interface GeneratorProps {
  // config prop defined in main Generator component
}

export interface GeneratorRef {
  refreshAnalysisAvailability: () => void;
}

export interface InvoiceDraft {
  id: string;
  rulesetId: string;
  year: number;
  month: number;
  index: number;
  amount: number;
  description: string;
  invoiceNoOverride: string;
  variableSymbolOverride: string;
  status: 'pending' | 'generating' | 'done' | 'error';
  label: string;
  periodLabel: string;
  monthSalary: number;
  periodBaseSalary: number; // Base salary for this period only, excluding carryover
  extraValue?: number;
}

// User edits to preserve across draft regenerations (non-amount fields only)
export interface DraftUserEdits {
  invoiceNoOverride?: string;
  variableSymbolOverride?: string;
  description?: string;
}

// Adhoc invoice that user can manually add to the working set
export interface AdhocInvoice {
  id: string;
  name: string;
  invoiceNo: string;
  variableSymbol: string;
  description: string;
  supplierId: string;
  customerId: string;
  value: number;
  issueDate: string; // ISO date string YYYY-MM-DD
  dueDate: string;   // ISO date string YYYY-MM-DD
}
