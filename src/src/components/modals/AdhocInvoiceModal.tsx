import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
import { 
  FileSignature, 
  Hash, 
  FileText, 
  Plus, 
  Pencil, 
  X, 
  Banknote 
} from 'lucide-react';
import { findOption, Select, SelectOption } from '../Select';
import { DatePicker } from '../DatePicker';
import { CompanyDetails } from '../../types';
import { ModalComponent, modal } from '../../contexts/ModalContext';

// Re-export this type for convenience (used in Generator types too)
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

export interface AdhocInvoiceModalProps {
  companies: CompanyDetails[];
  primaryCurrency: string;
  editingInvoice?: AdhocInvoice;
}

/**
 * Modal for creating/editing adhoc invoices.
 * 
 * @example
 * import { modal } from '../contexts/ModalContext';
 * import { AdhocInvoiceModal } from './modals/AdhocInvoiceModal';
 * 
 * // Create new
 * const result = await modal.open(AdhocInvoiceModal, { companies, primaryCurrency });
 * 
 * // Edit existing
 * const result = await modal.open(AdhocInvoiceModal, { companies, primaryCurrency, editingInvoice });
 */
export const AdhocInvoiceModal: ModalComponent<AdhocInvoiceModalProps, Omit<AdhocInvoice, 'id'> | null> & {
  create: (opts: { companies: CompanyDetails[]; primaryCurrency: string }) => Promise<Omit<AdhocInvoice, 'id'> | null>;
  edit: (opts: { companies: CompanyDetails[]; primaryCurrency: string; invoice: AdhocInvoice }) => Promise<Omit<AdhocInvoice, 'id'> | null>;
} = Object.assign(
  (({
    companies, 
    primaryCurrency, 
    editingInvoice,
    resolve,
  }) => {
    const isEditMode = !!editingInvoice;
  
    // Default dates
  const today = new Date();
  const defaultIssueDate = today.toISOString().split('T')[0];
  const defaultDueDate = new Date(today.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  
  const [name, setName] = useState(editingInvoice?.name || '');
  const [invoiceNo, setInvoiceNo] = useState(editingInvoice?.invoiceNo || '');
  const [variableSymbol, setVariableSymbol] = useState(editingInvoice?.variableSymbol || '');
  const [vsManuallyEdited, setVsManuallyEdited] = useState(isEditMode);
  const [description, setDescription] = useState(editingInvoice?.description || '');
  const [supplierId, setSupplierId] = useState(editingInvoice?.supplierId || '');
  const [customerId, setCustomerId] = useState(editingInvoice?.customerId || '');
  const [value, setValue] = useState(editingInvoice?.value?.toString() || '');
  const [issueDate, setIssueDate] = useState(editingInvoice?.issueDate || defaultIssueDate);
  const [dueDate, setDueDate] = useState(editingInvoice?.dueDate || defaultDueDate);

  // Auto-set VS when invoice number changes (if VS hasn't been manually edited)
  useEffect(() => {
    if (!vsManuallyEdited && invoiceNo) {
      setVariableSymbol(invoiceNo);
    }
  }, [invoiceNo, vsManuallyEdited]);

  const suppliers = companies.filter(c => c.isSupplier);
  const customers = companies.filter(c => !c.isSupplier);

  const supplierOptions: SelectOption[] = suppliers.map(c => ({ value: c.id, label: c.name }));
  const customerOptions: SelectOption[] = customers.map(c => ({ value: c.id, label: c.name }));

  // Set defaults only when creating new invoice
  useEffect(() => {
    if (!isEditMode) {
      if (suppliers.length > 0 && !supplierId) {
        setSupplierId(suppliers[0].id);
      }
      if (customers.length > 0 && !customerId) {
        setCustomerId(customers[0].id);
      }
    }
  }, [suppliers, customers, isEditMode, supplierId, customerId]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const numValue = parseFloat(value);
    if (!name || !invoiceNo || !supplierId || !customerId || isNaN(numValue) || numValue <= 0) {
      toast.error('Please fill in all required fields');
      return;
    }

    resolve({
      name,
      invoiceNo,
      variableSymbol: variableSymbol || invoiceNo,
      description,
      supplierId,
      customerId,
      value: numValue,
      issueDate,
      dueDate
    });
  };

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') resolve(null);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [resolve]);

  // Disable body scroll
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  return createPortal(
    <div 
      className="modal-backdrop animate-fade-in"
      onClick={(e) => e.target === e.currentTarget && resolve(null)}
    >
      <div 
        className="modal-content w-full max-w-lg"
        style={{ backgroundColor: 'var(--bg-surface)' }}
      >
        {/* Header */}
        <div 
          className="flex justify-between items-center px-6 py-4"
          style={{ borderBottom: '1px solid var(--border-default)' }}
        >
          <div className="flex items-center gap-3">
            <div 
              className="w-10 h-10 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: 'var(--accent-100)' }}
            >
              {isEditMode ? (
                <Pencil size={20} style={{ color: 'var(--accent-600)' }} />
              ) : (
                <Plus size={20} style={{ color: 'var(--accent-600)' }} />
              )}
            </div>
            <div>
              <h3 
                className="text-lg font-bold"
                style={{ color: 'var(--text-primary)' }}
              >
                {isEditMode ? 'Edit Invoice' : 'Add Invoice'}
              </h3>
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                {isEditMode ? 'Update invoice details' : 'Create a custom invoice'}
              </p>
            </div>
          </div>
          <button 
            onClick={() => resolve(null)}
            className="btn btn-ghost btn-icon"
            title="Close (Esc)"
          >
            <X size={22} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Name */}
          <div>
            <label 
              className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide mb-2"
              style={{ color: 'var(--text-muted)' }}
            >
              <FileSignature size={14} />
              Name
            </label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Invoice name/label"
              className="w-full"
              autoFocus
            />
          </div>

          {/* Invoice Number / VS */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label 
                className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide mb-2"
                style={{ color: 'var(--text-muted)' }}
              >
                <Hash size={14} />
                Number
              </label>
              <input
                type="text"
                value={invoiceNo}
                onChange={e => setInvoiceNo(e.target.value)}
                placeholder="Invoice number"
                className="w-full font-mono"
              />
            </div>
            <div>
              <label 
                className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide mb-2"
                style={{ color: 'var(--text-muted)' }}
              >
                <Hash size={14} />
                VS
              </label>
              <input
                type="text"
                value={variableSymbol}
                onChange={e => {
                  setVariableSymbol(e.target.value);
                  setVsManuallyEdited(true);
                }}
                placeholder="Variable symbol"
                className="w-full font-mono"
              />
            </div>
          </div>

          {/* Description */}
          <div>
            <label 
              className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide mb-2"
              style={{ color: 'var(--text-muted)' }}
            >
              <FileText size={14} />
              Description
            </label>
            <input
              type="text"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Invoice description"
              className="w-full"
            />
          </div>

          {/* Issue Date / Due Date */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label 
                className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide mb-2"
                style={{ color: 'var(--text-muted)' }}
              >
                Issue Date
              </label>
              <DatePicker
                value={issueDate}
                onChange={setIssueDate}
                mode="day"
                placeholder="Select issue date"
              />
            </div>
            <div>
              <label 
                className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide mb-2"
                style={{ color: 'var(--text-muted)' }}
              >
                Due Date
              </label>
              <DatePicker
                value={dueDate}
                onChange={setDueDate}
                mode="day"
                placeholder="Select due date"
              />
            </div>
          </div>

          {/* Supplier / Customer */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label 
                className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide mb-2"
                style={{ color: 'var(--text-muted)' }}
              >
                Supplier
              </label>
              <Select
                value={findOption(supplierOptions, supplierId)}
                onChange={opt => opt && setSupplierId(opt.value)}
                options={supplierOptions}
                placeholder="Select supplier..."
              />
            </div>
            <div>
              <label 
                className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide mb-2"
                style={{ color: 'var(--text-muted)' }}
              >
                Customer
              </label>
              <Select
                value={findOption(customerOptions, customerId)}
                onChange={opt => opt && setCustomerId(opt.value)}
                options={customerOptions}
                placeholder="Select customer..."
              />
            </div>
          </div>

          {/* Value */}
          <div>
            <label 
              className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide mb-2"
              style={{ color: 'var(--text-muted)' }}
            >
              <Banknote size={14} />
              Value
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={value}
                onChange={e => setValue(e.target.value)}
                placeholder="0"
                className="flex-1 font-mono text-lg"
                min="0"
                step="0.01"
              />
              <span 
                className="text-lg font-bold"
                style={{ color: 'var(--text-muted)' }}
              >
                {primaryCurrency}
              </span>
            </div>
          </div>

          {/* Actions */}
          <div 
            className="flex justify-end gap-3 pt-4"
            style={{ borderTop: '1px solid var(--border-default)' }}
          >
            <button
              type="button"
              onClick={() => resolve(null)}
              className="btn btn-secondary"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
            >
              {isEditMode ? 'Update' : 'Add Invoice'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
  }) as ModalComponent<AdhocInvoiceModalProps, Omit<AdhocInvoice, 'id'> | null>,
  {
    create: (opts: { companies: CompanyDetails[]; primaryCurrency: string }): Promise<Omit<AdhocInvoice, 'id'> | null> => 
      modal.open(AdhocInvoiceModal, opts),
    edit: (opts: { companies: CompanyDetails[]; primaryCurrency: string; invoice: AdhocInvoice }): Promise<Omit<AdhocInvoice, 'id'> | null> => 
      modal.open<AdhocInvoiceModalProps, Omit<AdhocInvoice, 'id'> | null>(AdhocInvoiceModal, { ...opts, editingInvoice: opts.invoice }),
  }
);
