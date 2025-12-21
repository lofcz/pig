export interface CompanyDetails {
  id: string;
  name: string;
  street: string;
  city: string;
  zip: string;
  country: string;
  ic: string;
  dic?: string;
  isSupplier?: boolean;
  contactId?: string; // Reference to a Contact for this customer
  bankAccount?: string; // Only for suppliers
}

export interface Contact {
  id: string;
  name: string;
  email: string;
  phone?: string;
}

export type PeriodicityType = 'monthly' | 'quarterly' | 'yearly' | 'custom_months' | 'custom_days';

export interface CustomerRule {
  companyId: string;
  condition: 'odd' | 'even' | 'default';
}

export interface SalaryRule {
  startDate: string; // YYYY-MM
  endDate: string; // YYYY-MM
  value: number;
  deduction: number;
}

export interface Ruleset {
  id: string;
  name: string;
  periodicity: PeriodicityType;
  periodicityCustomValue?: number;
  entitlementDay: number;
  dueDateOffsetDays?: number; // Days from current date for due date (default: 14)
  minimizeInvoices?: boolean;
  maxInvoiceValue?: number; // Max value per invoice before splitting
  salaryRules: SalaryRule[];
  rules: CustomerRule[];
  descriptions: string[];
  templatePath?: string;
}

export type ThemePreference = 'light' | 'dark' | 'system';

export type Currency = 'CZK' | 'EUR' | 'USD';

export interface Config {
  rootPath: string;
  sofficePath?: string; // Path to LibreOffice soffice executable
  companies: CompanyDetails[];
  contacts: Contact[];
  rulesets: Ruleset[];
  primaryCurrency: Currency; // The main currency for invoices and totals
  exchangeRates: {
    EUR: number;
    USD: number;
    CZK: number;
  };
  theme?: ThemePreference;
  // Deprecated - migrated to CompanyDetails.bankAccount (for suppliers)
  bankAccount?: string;
  // Deprecated - migrated to Ruleset.maxInvoiceValue
  maxInvoiceValue?: number;
}

export const DEFAULT_CONFIG: Config = {
  rootPath: "",
  contacts: [],
  companies: [],
  rulesets: [],
  primaryCurrency: 'CZK',
  exchangeRates: {
    EUR: 25,
    USD: 23,
    CZK: 1
  },
  theme: 'system'
};
