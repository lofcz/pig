import { Currency, Config, CompanyDetails, Contact, EmailTemplate, EmailConnector } from '../../types';

export interface InvoiceToGenerate {
  id: string;
  label: string;
  amount: number;
  customerId?: string;
  invoiceNo?: string;
  issueDate?: string;
  dueDate?: string;
  description?: string;
}

export interface GeneratedInvoice {
  id: string;
  label: string;
  amount: number;
  pdfPath: string;
  customerId?: string;
  invoiceNo?: string;
  issueDate?: string;
  dueDate?: string;
  description?: string;
}

export interface ExtraFile {
  path: string;
  name: string;
}

export interface InvoiceStatus {
  id: string;
  status: 'pending' | 'generating' | 'done' | 'error';
  pdfPath?: string;
  justFinished?: boolean;
}

export type ModalPhase = 'generating' | 'complete' | 'email-list' | 'email-compose';

// Email task groups invoices by contact+template+connector
export interface EmailTask {
  id: string;
  contact: Contact;
  template: EmailTemplate;
  connector: EmailConnector;
  customers: CompanyDetails[];
  invoices: GeneratedInvoice[];
  status: 'pending' | 'composing' | 'sent' | 'skipped' | 'error';
}

export interface AttachmentItem {
  id: string;
  filename: string;
  path: string;
  size: number;
  contentType: string;
  isInvoice: boolean; // true for auto-added invoice PDFs, false for user-added extras
}

export interface GenerateAllModalProps {
  isOpen: boolean;
  onClose: () => void;
  invoices: InvoiceToGenerate[];
  primaryCurrency: Currency;
  onGenerateInvoice: (id: string) => Promise<string | undefined>;
  rootPath: string;
  onComplete: () => Promise<void>;
  config?: Config;
  extraFiles?: ExtraFile[];
}

// Context types
export interface GenerateAllOptions {
  config: Config;
  invoices: InvoiceToGenerate[];
  extraFiles: ExtraFile[];
  primaryCurrency: Currency;
  rootPath: string;
  onGenerateInvoice: (id: string) => Promise<string | undefined>;
  onComplete: () => Promise<void>;
}

export interface GenerateAllResult {
  generatedCount: number;
  totalAmount: number;
  emailsSent: number;
  emailsSkipped: number;
}

export interface GenerateAllModalContextType {
  generateAll: (options: GenerateAllOptions) => Promise<GenerateAllResult>;
}
