import { useState, useEffect, useCallback, useMemo, memo } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
import {
  FileSignature,
  Hash,
  FileText,
  Plus,
  Pencil,
  X,
  Banknote,
  Layers,
  Dices
} from 'lucide-react';
import { findOption, Select, SelectOption, CreatableSelect } from '../Select';
import { DatePicker } from '../DatePicker';
import { FormattedNumberInput } from '../FormattedNumberInput';
import { CompanyDetails, Ruleset } from '../../types';
import { ModalComponent, modal } from '../../contexts/ModalContext';
import {
  getAdhocInvoicePartCount,
  normalizeAdhocVariableSymbol,
} from '../Generator/adhocSplit';

// Re-export this type for convenience (used in Generator types too)
export interface AdhocInvoice {
  id: string;
  name: string;
  invoiceNo: string;
  variableSymbol: string;
  description: string;
  partDescriptions?: string[];
  supplierId: string;
  customerId: string;
  value: number;
  issueDate: string; // ISO date string YYYY-MM-DD
  dueDate: string;   // ISO date string YYYY-MM-DD
  // Optional parent ruleset. When set and the ruleset has maxInvoiceValue,
  // the invoice auto-splits into max-value chunks + remainder.
  rulesetId?: string;
}

export interface AdhocInvoiceModalProps {
  companies: CompanyDetails[];
  primaryCurrency: string;
  rulesets: Ruleset[];
  editingInvoice?: AdhocInvoice;
}

interface PartDescriptionFieldProps {
  partIndex: number;
  totalCount: number;
  value: string;
  options: SelectOption[];
  onChange: (partIndex: number, value: string) => void;
  onRandomize: (partIndex: number) => void;
}

function pickRandomDescription(descriptions: string[], current = ''): string {
  if (descriptions.length === 0) return current;
  const alternatives = descriptions.filter(description => description !== current);
  const pool = alternatives.length > 0 ? alternatives : descriptions;
  return pool[Math.floor(Math.random() * pool.length)];
}

function formatCreateDescription(inputValue: string): string {
  return `Use "${inputValue}"`;
}

const PartDescriptionField = memo(function PartDescriptionField({
  partIndex,
  totalCount,
  value,
  options,
  onChange,
  onRandomize,
}: PartDescriptionFieldProps) {
  const selectedOption = useMemo(
    () => findOption(options, value) || (value ? { value, label: value } : null),
    [options, value]
  );

  const handleChange = useCallback((option: SelectOption | null) => {
    onChange(partIndex, option?.value || '');
  }, [onChange, partIndex]);

  const handleRandomize = useCallback(() => {
    onRandomize(partIndex);
  }, [onRandomize, partIndex]);

  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <label
          className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide"
          style={{ color: 'var(--text-muted)' }}
        >
          <FileText size={14} />
          {totalCount > 1 ? `Description · Part ${partIndex + 1} of ${totalCount}` : 'Description'}
        </label>
        <button
          type="button"
          onClick={handleRandomize}
          disabled={options.length === 0}
          className="ml-auto inline-flex shrink-0 rounded-md p-1 transition-colors hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-35 dark:hover:bg-white/10"
          title={options.length > 0 ? 'Randomize description' : 'The selected ruleset has no description presets'}
          aria-label={`Randomize description${totalCount > 1 ? ` for part ${partIndex + 1}` : ''}`}
        >
          <Dices size={15} />
        </button>
      </div>
      <CreatableSelect
        value={selectedOption}
        onChange={handleChange}
        options={options}
        isClearable
        placeholder="Select or type a description..."
        formatCreateLabel={formatCreateDescription}
      />
    </div>
  );
});

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
  create: (opts: { companies: CompanyDetails[]; primaryCurrency: string; rulesets: Ruleset[] }) => Promise<Omit<AdhocInvoice, 'id'> | null>;
  edit: (opts: { companies: CompanyDetails[]; primaryCurrency: string; rulesets: Ruleset[]; invoice: AdhocInvoice }) => Promise<Omit<AdhocInvoice, 'id'> | null>;
} = Object.assign(
  (({
    companies,
    primaryCurrency,
    rulesets,
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
  const [variableSymbol, setVariableSymbol] = useState(() =>
    normalizeAdhocVariableSymbol(editingInvoice?.variableSymbol || '', editingInvoice?.invoiceNo || '')
  );
  const [vsManuallyEdited, setVsManuallyEdited] = useState(isEditMode);
  const [partDescriptions, setPartDescriptions] = useState<string[]>(() =>
    editingInvoice?.partDescriptions?.length
      ? editingInvoice.partDescriptions
      : [editingInvoice?.description || '']
  );
  const [supplierId, setSupplierId] = useState(editingInvoice?.supplierId || '');
  const [customerId, setCustomerId] = useState(editingInvoice?.customerId || '');
  const [value, setValue] = useState(editingInvoice?.value?.toString() || '');
  const [issueDate, setIssueDate] = useState(editingInvoice?.issueDate || defaultIssueDate);
  const [dueDate, setDueDate] = useState(editingInvoice?.dueDate || defaultDueDate);
  const [rulesetId, setRulesetId] = useState(editingInvoice?.rulesetId || '');
  const selectedRuleset = useMemo(
    () => rulesets.find(ruleset => ruleset.id === rulesetId),
    [rulesetId, rulesets]
  );
  const descriptionPresets = useMemo(
    () => selectedRuleset?.descriptions?.filter(Boolean) || [],
    [selectedRuleset]
  );
  const descriptionOptions = useMemo(
    () => descriptionPresets.map(description => ({ value: description, label: description })),
    [descriptionPresets]
  );
  const partCount = useMemo(
    () => getAdhocInvoicePartCount(Number(value), selectedRuleset),
    [selectedRuleset, value]
  );

  // Auto-set VS when invoice number changes (if VS hasn't been manually edited)
  useEffect(() => {
    if (!vsManuallyEdited && invoiceNo) {
      setVariableSymbol(normalizeAdhocVariableSymbol('', invoiceNo));
    }
  }, [invoiceNo, vsManuallyEdited]);

  const handleInvoiceNoChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    setInvoiceNo(event.target.value);
  }, []);

  const handleVariableSymbolChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    setVariableSymbol(event.target.value.replace(/\D/g, ''));
    setVsManuallyEdited(true);
  }, []);

  useEffect(() => {
    setPartDescriptions(previous => {
      if (previous.length === partCount) return previous;
      return Array.from(
        { length: partCount },
        (_, index) => previous[index] ?? pickRandomDescription(descriptionPresets)
      );
    });
  }, [descriptionPresets, partCount]);

  const handleRulesetChange = useCallback((option: SelectOption | null) => {
    const nextRulesetId = option?.value || '';
    const nextRuleset = rulesets.find(ruleset => ruleset.id === nextRulesetId);
    const nextPresets = nextRuleset?.descriptions?.filter(Boolean) || [];
    const nextPartCount = getAdhocInvoicePartCount(Number(value), nextRuleset);

    setRulesetId(nextRulesetId);
    if (nextPresets.length > 0) {
      setPartDescriptions(
        Array.from({ length: nextPartCount }, () => pickRandomDescription(nextPresets))
      );
    } else {
      setPartDescriptions(previous =>
        Array.from({ length: nextPartCount }, (_, index) => previous[index] || '')
      );
    }
  }, [rulesets, value]);

  const handlePartDescriptionChange = useCallback((partIndex: number, nextValue: string) => {
    setPartDescriptions(previous =>
      Array.from(
        { length: Math.max(partCount, previous.length) },
        (_, index) => index === partIndex ? nextValue : previous[index] || ''
      )
    );
  }, [partCount]);

  const handleRandomizeDescription = useCallback((partIndex: number) => {
    setPartDescriptions(previous =>
      previous.map((description, index) =>
        index === partIndex
          ? pickRandomDescription(descriptionPresets, description)
          : description
      )
    );
  }, [descriptionPresets]);

  const suppliers = companies.filter(c => c.isSupplier);
  const customers = companies.filter(c => !c.isSupplier);

  const supplierOptions: SelectOption[] = suppliers.map(c => ({ value: c.id, label: c.name }));
  const customerOptions: SelectOption[] = customers.map(c => ({ value: c.id, label: c.name }));
  const rulesetOptions: SelectOption[] = rulesets.map(r => ({
    value: r.id,
    label: r.maxInvoiceValue
      ? `${r.name} (splits over ${r.maxInvoiceValue.toLocaleString()})`
      : r.name,
  }));

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
    if (!variableSymbol || !/^\d+$/.test(variableSymbol)) {
      toast.error('Variable symbol must contain numbers only');
      return;
    }

    resolve({
      name,
      invoiceNo,
      variableSymbol,
      description: partDescriptions[0] || '',
      partDescriptions: partDescriptions.slice(0, partCount),
      supplierId,
      customerId,
      value: numValue,
      issueDate,
      dueDate,
      rulesetId: rulesetId || undefined
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
          style={{
            borderBottom: '1px solid var(--border-default)',
            backgroundColor: 'var(--bg-surface)'
          }}
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
                onChange={handleInvoiceNoChange}
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
                inputMode="numeric"
                pattern="[0-9]*"
                value={variableSymbol}
                onChange={handleVariableSymbolChange}
                placeholder="Numbers only"
                className="w-full font-mono"
              />
            </div>
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

          {/* Parent ruleset (optional) — drives maxInvoiceValue autosplitting */}
          <div>
            <label
              className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide mb-2"
              style={{ color: 'var(--text-muted)' }}
            >
              <Layers size={14} />
              Parent ruleset (optional)
            </label>
            <Select
              value={findOption(rulesetOptions, rulesetId)}
              onChange={handleRulesetChange}
              options={rulesetOptions}
              isClearable
              placeholder="None — standalone invoice"
            />
            {rulesetId && (() => {
              const rs = rulesets.find(r => r.id === rulesetId);
              if (!rs?.maxInvoiceValue) {
                return (
                  <p className="text-xs mt-1.5" style={{ color: 'var(--text-muted)' }}>
                    This ruleset has no max invoice value — it won't split. Its template will still be used.
                  </p>
                );
              }
              return (
                <p className="text-xs mt-1.5" style={{ color: 'var(--text-muted)' }}>
                  Splits into {rs.maxInvoiceValue.toLocaleString()} {primaryCurrency} chunks when value exceeds it.
                </p>
              );
            })()}
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
              <FormattedNumberInput
                value={value}
                onValueChange={setValue}
                placeholder="0"
                className="flex-1 font-mono text-lg"
                autoComplete="off"
              />
              <span 
                className="text-lg font-bold"
                style={{ color: 'var(--text-muted)' }}
              >
                {primaryCurrency}
              </span>
            </div>
          </div>

          {/* Per-document descriptions */}
          <div
            className="space-y-4 rounded-xl border p-4"
            style={{
              borderColor: 'var(--border-default)',
              backgroundColor: 'var(--bg-muted)',
            }}
          >
            <div>
              <h4 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                {partCount > 1 ? 'Descriptions for generated parts' : 'Invoice description'}
              </h4>
              <p className="mt-0.5 text-xs" style={{ color: 'var(--text-subtle)' }}>
                {descriptionPresets.length > 0
                  ? 'Defaults are randomized from the parent ruleset. Each document can be changed independently.'
                  : 'Select or type the description used in the generated document.'}
              </p>
            </div>
            {Array.from({ length: partCount }, (_, partIndex) => (
              <PartDescriptionField
                key={partIndex}
                partIndex={partIndex}
                totalCount={partCount}
                value={partDescriptions[partIndex] || ''}
                options={descriptionOptions}
                onChange={handlePartDescriptionChange}
                onRandomize={handleRandomizeDescription}
              />
            ))}
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
    create: (opts: { companies: CompanyDetails[]; primaryCurrency: string; rulesets: Ruleset[] }): Promise<Omit<AdhocInvoice, 'id'> | null> => 
      modal.open(AdhocInvoiceModal, opts),
    edit: (opts: { companies: CompanyDetails[]; primaryCurrency: string; rulesets: Ruleset[]; invoice: AdhocInvoice }): Promise<Omit<AdhocInvoice, 'id'> | null> => 
      modal.open<AdhocInvoiceModalProps, Omit<AdhocInvoice, 'id'> | null>(AdhocInvoiceModal, { ...opts, editingInvoice: opts.invoice }),
  }
);
