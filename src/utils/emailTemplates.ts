import { Eta } from 'eta';
import { EmailTemplate, Contact, CompanyDetails } from '../types';

// Initialize Eta with custom delimiters that work well with HTML
const eta = new Eta({
  // Use default <% %> for logic, <%= %> for output
  autoEscape: false, // Don't escape HTML - we handle that ourselves
  autoTrim: false,   // Preserve whitespace
});

// Available placeholder categories and their fields
export const PLACEHOLDER_CATEGORIES = {
  contact: {
    label: 'Contact',
    placeholders: [
      { key: 'contact.name', label: 'Name' },
      { key: 'contact.email', label: 'Email' },
      { key: 'contact.phone', label: 'Phone' },
    ],
  },
  invoice: {
    label: 'Invoice',
    placeholders: [
      { key: 'invoice.number', label: 'Invoice Number' },
      { key: 'invoice.date', label: 'Issue Date' },
      { key: 'invoice.dueDate', label: 'Due Date' },
      { key: 'invoice.amount', label: 'Amount' },
      { key: 'invoice.currency', label: 'Currency' },
      { key: 'invoice.description', label: 'Description' },
    ],
  },
  invoices: {
    label: 'Invoices (Multiple)',
    placeholders: [
      { key: 'invoices.count', label: 'Number of Invoices' },
      { key: 'invoices.totalAmount', label: 'Total Amount' },
      { key: 'invoices.numbers', label: 'Invoice Numbers (comma-separated)' },
    ],
  },
  customer: {
    label: 'Customer',
    placeholders: [
      { key: 'customer.name', label: 'Company Name' },
      { key: 'customer.street', label: 'Street' },
      { key: 'customer.city', label: 'City' },
      { key: 'customer.zip', label: 'ZIP Code' },
      { key: 'customer.country', label: 'Country' },
      { key: 'customer.ic', label: 'IČ (Company ID)' },
      { key: 'customer.dic', label: 'DIČ (VAT ID)' },
    ],
  },
  supplier: {
    label: 'Supplier',
    placeholders: [
      { key: 'supplier.name', label: 'Company Name' },
      { key: 'supplier.street', label: 'Street' },
      { key: 'supplier.city', label: 'City' },
      { key: 'supplier.zip', label: 'ZIP Code' },
      { key: 'supplier.country', label: 'Country' },
      { key: 'supplier.ic', label: 'IČ (Company ID)' },
      { key: 'supplier.dic', label: 'DIČ (VAT ID)' },
      { key: 'supplier.bankAccount', label: 'Bank Account' },
    ],
  },
} as const;

// Get all placeholders as a flat list
export function getAllPlaceholders(): { key: string; label: string }[] {
  return Object.values(PLACEHOLDER_CATEGORIES).flatMap((cat) => 
    cat.placeholders.map(p => ({ key: p.key, label: p.label }))
  );
}

// Single invoice info
export interface InvoiceInfo {
  number: string;
  date: string;
  dueDate: string;
  amount: number;
  currency: string;
  description: string;
}

// Context for evaluating placeholders
export interface PlaceholderContext {
  contact?: Contact;
  customer?: CompanyDetails;
  supplier?: CompanyDetails;
  invoice?: InvoiceInfo;         // Single invoice (for backwards compat)
  invoices?: InvoiceInfo[];      // Multiple invoices
}

// Build the data object for Eta templates from context
function buildEtaData(context: PlaceholderContext) {
  const invoices = context.invoices || (context.invoice ? [context.invoice] : []);
  
  return {
    contact: context.contact || {},
    customer: context.customer || {},
    supplier: context.supplier || {},
    invoice: context.invoice || invoices[0] || {},
    invoices: {
      list: invoices,
      count: invoices.length,
      totalAmount: invoices.reduce((sum, inv) => sum + inv.amount, 0),
      numbers: invoices.map(inv => inv.number).join(', '),
    },
    // Helper functions available in templates
    formatAmount: (amount: number, currency?: string) => {
      const formatted = amount.toLocaleString('cs-CZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      return currency ? `${formatted} ${currency}` : formatted;
    },
    plural: (count: number, one: string, few: string, many: string) => {
      // Czech pluralization rules
      if (count === 1) return one;
      if (count >= 2 && count <= 4) return few;
      return many;
    },
  };
}

// Evaluate an HTML email body with placeholders and Eta syntax
export function evaluateEmailBody(html: string, context: PlaceholderContext): string {
  return evaluateWithEta(html, context);
}

// Convert simple {{key}} placeholders to Eta syntax <%= it.key %>
function convertPlaceholdersToEta(text: string): string {
  return text.replace(/\{\{([^}]+)\}\}/g, (_match, key) => {
    const trimmedKey = key.trim();
    return `<%= it.${trimmedKey} %>`;
  });
}

// Evaluate a string with Eta (supports both {{key}} placeholders and Eta syntax)
export function evaluateWithEta(template: string, context: PlaceholderContext): string {
  try {
    const data = buildEtaData(context);
    // First convert simple placeholders, then run through Eta
    const etaTemplate = convertPlaceholdersToEta(template);
    return eta.renderString(etaTemplate, data);
  } catch (error) {
    console.error('Eta template error:', error);
    return template; // Return original on error
  }
}

// Evaluate placeholders in a subject line (supports both {{key}} and Eta syntax)
export function evaluateSubject(subject: string, context: PlaceholderContext): string {
  return evaluateWithEta(subject, context);
}

// Convert TipTap JSON to plain text (for non-HTML email clients)
export function tipTapToPlainText(content: any): string {
  if (!content) return '';

  if (typeof content === 'string') return content;

  if (content.type === 'text') {
    return content.text || '';
  }

  if (content.type === 'templatePlaceholder') {
    return `{{${content.attrs?.key || 'unknown'}}}`;
  }

  if (content.type === 'paragraph') {
    const text = (content.content || []).map(tipTapToPlainText).join('');
    return text + '\n';
  }

  if (content.type === 'hardBreak') {
    return '\n';
  }

  if (content.content && Array.isArray(content.content)) {
    return content.content.map(tipTapToPlainText).join('');
  }

  return '';
}

// Convert TipTap JSON to HTML
export function tipTapToHtml(content: any): string {
  if (!content) return '';

  if (typeof content === 'string') return escapeHtml(content);

  if (content.type === 'text') {
    let text = escapeHtml(content.text || '');
    // Apply marks
    if (content.marks) {
      for (const mark of content.marks) {
        switch (mark.type) {
          case 'bold':
            text = `<strong>${text}</strong>`;
            break;
          case 'italic':
            text = `<em>${text}</em>`;
            break;
          case 'underline':
            text = `<u>${text}</u>`;
            break;
          case 'strike':
            text = `<s>${text}</s>`;
            break;
          case 'link':
            text = `<a href="${escapeHtml(mark.attrs?.href || '')}">${text}</a>`;
            break;
        }
      }
    }
    return text;
  }

  if (content.type === 'templatePlaceholder') {
    return `<span style="background:#e0e7ff;color:#3730a3;padding:2px 6px;border-radius:4px;">{{${content.attrs?.key || 'unknown'}}}</span>`;
  }

  if (content.type === 'paragraph') {
    const inner = (content.content || []).map(tipTapToHtml).join('');
    // Empty paragraphs become just a line break, not <p><br></p>
    if (!inner) return '<br>\n';
    return `<p>${inner}</p>`;
  }

  if (content.type === 'hardBreak') {
    return '<br>';
  }

  if (content.type === 'heading') {
    const level = content.attrs?.level || 1;
    const inner = (content.content || []).map(tipTapToHtml).join('');
    return `<h${level}>${inner}</h${level}>`;
  }

  if (content.type === 'bulletList') {
    const inner = (content.content || []).map(tipTapToHtml).join('');
    return `<ul>${inner}</ul>`;
  }

  if (content.type === 'orderedList') {
    const inner = (content.content || []).map(tipTapToHtml).join('');
    return `<ol>${inner}</ol>`;
  }

  if (content.type === 'listItem') {
    const inner = (content.content || []).map(tipTapToHtml).join('');
    return `<li>${inner}</li>`;
  }

  if (content.type === 'blockquote') {
    const inner = (content.content || []).map(tipTapToHtml).join('');
    return `<blockquote>${inner}</blockquote>`;
  }

  if (content.type === 'doc' || content.content) {
    return (content.content || []).map(tipTapToHtml).join('');
  }

  return '';
}

function escapeHtml(text: string): string {
  // Preserve Eta template syntax by using placeholders
  const etaPlaceholders: string[] = [];
  let preserved = text.replace(/<%[\s\S]*?%>/g, (match) => {
    etaPlaceholders.push(match);
    return `__ETA_PLACEHOLDER_${etaPlaceholders.length - 1}__`;
  });
  
  // Escape HTML
  preserved = preserved
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
  
  // Restore Eta syntax
  etaPlaceholders.forEach((eta, i) => {
    preserved = preserved.replace(`__ETA_PLACEHOLDER_${i}__`, eta);
  });
  
  return preserved;
}

// Create a default empty template
export function createDefaultTemplate(id: string): EmailTemplate {
  return {
    id,
    name: '',
    subject: '',
    body: '',
  };
}

