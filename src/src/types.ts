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
  emailTemplateId?: string; // Reference to an EmailTemplate for this customer
  emailConnectorId?: string; // Reference to an EmailConnector (SMTP) for this customer
  bankAccount?: string; // Only for suppliers
}

export interface Contact {
  id: string;
  name: string;
  email: string;
  phone?: string;
}

// Email template with HTML content
export interface EmailTemplate {
  id: string;
  name: string;
  subject: string; // Subject line (can contain placeholders)
  body: string; // HTML content (supports arbitrary HTML + Eta syntax)
}

// SMTP connector for sending emails
export interface EmailConnector {
  id: string;
  name: string;
  host: string;
  port: number;
  secure: boolean; // true for SSL/TLS (port 465), false for STARTTLS (port 587)
  username: string;
  password: string; // App password for Gmail
  fromEmail: string;
  fromName?: string;
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

/** Project folder structure configuration */
export interface ProjectStructure {
  /** Name of the invoices folder (default: "invoices") */
  invoicesFolder: string;
  /** Path to pending reimbursements folder from root (default: "reimburse/pending") */
  reimbursePendingFolder: string;
  /** Path to completed reimbursements folder from root (default: "reimburse/done") */
  reimburseDoneFolder: string;
}

export const DEFAULT_PROJECT_STRUCTURE: ProjectStructure = {
  invoicesFolder: 'invoices',
  reimbursePendingFolder: 'reimburse/pending',
  reimburseDoneFolder: 'reimburse/done',
};

export interface Config {
  rootPath: string;
  projectName?: string; // User-friendly project name
  projectStructure?: ProjectStructure; // Custom folder naming
  companies: CompanyDetails[];
  contacts: Contact[];
  emailTemplates: EmailTemplate[];
  emailConnectors: EmailConnector[];
  rulesets: Ruleset[];
  primaryCurrency: Currency; // The main currency for invoices and totals
  exchangeRates: {
    EUR: number;
    USD: number;
    CZK: number;
  };
  // Deprecated - migrated to CompanyDetails.bankAccount (for suppliers)
  bankAccount?: string;
  // Deprecated - migrated to Ruleset.maxInvoiceValue
  maxInvoiceValue?: number;
  // Deprecated - moved to global settings
  sofficePath?: string;
  theme?: ThemePreference;
}

export const DEFAULT_CONFIG: Config = {
  rootPath: "",
  projectName: "",
  projectStructure: DEFAULT_PROJECT_STRUCTURE,
  contacts: [],
  companies: [],
  emailTemplates: [],
  emailConnectors: [],
  rulesets: [],
  primaryCurrency: 'CZK',
  exchangeRates: {
    EUR: 25,
    USD: 23,
    CZK: 1
  },
};
