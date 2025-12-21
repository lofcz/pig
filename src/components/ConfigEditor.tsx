import { useState, useEffect, forwardRef, useImperativeHandle, useMemo, useCallback, useRef } from 'react';
import { Config, CompanyDetails, SalaryRule, CustomerRule, Ruleset, Contact } from '../types';
import { DragDropProvider, DragOverlay } from '@dnd-kit/react';
import { useSortable } from '@dnd-kit/react/sortable';
import { move } from '@dnd-kit/helpers';
import { saveConfig } from '../utils/config';
import { open } from '@tauri-apps/plugin-dialog';
import { exists } from '@tauri-apps/plugin-fs';
import { useTheme, Theme } from '../contexts/ThemeContext';
import { useConfirm } from '../contexts/ConfirmModalContext';
import { usePrompt } from '../contexts/PromptModalContext';
import { useEventListener } from '../hooks';
import { DatePicker } from './DatePicker';
import { toast } from 'sonner';
import {
  FolderOpen,
  Building2,
  Users,
  Layers,
  Settings2,
  CreditCard,
  Percent,
  Plus,
  Trash2,
  ChevronDown,
  Check,
  AlertTriangle,
  Calendar,
  DollarSign,
  FileText,
  Clock,
  ArrowRight,
  Sun,
  Moon,
  Monitor,
  Palette,
  GripVertical,
  Mail,
  Phone,
  Terminal,
  Wand2
} from 'lucide-react';
import { Select, SelectOption, findOption } from './Select';

// Select options constants
const PERIODICITY_OPTIONS: SelectOption[] = [
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'yearly', label: 'Yearly' },
  { value: 'custom_months', label: 'Custom (Months)' },
  { value: 'custom_days', label: 'Custom (Days)' },
];

const CONDITION_OPTIONS: SelectOption[] = [
  { value: 'odd', label: 'Odd Month' },
  { value: 'even', label: 'Even Month' },
  { value: 'default', label: 'Default (Always)' },
];

interface ConfigEditorProps {
  config: Config;
  onSave: (newConfig: Config) => void;
  onCancel: () => void;
  isVisible?: boolean;
}

export interface ConfigEditorRef {
  save: () => Promise<void>;
}

const ConfigEditor = forwardRef<ConfigEditorRef, ConfigEditorProps>(({ config, onSave, isVisible }, ref) => {
  const [localConfig, setLocalConfig] = useState<Config>(JSON.parse(JSON.stringify(config)));
  const [activeTab, setActiveTab] = useState<'general' | 'supplier' | 'customers' | 'contacts' | 'rulesets'>('general');
  const { theme, setTheme } = useTheme();
  const confirm = useConfirm();
  const prompt = usePrompt();

  // Reset local config when becoming visible (discard any uncommitted changes)
  useEffect(() => {
    if (isVisible) {
      setLocalConfig(JSON.parse(JSON.stringify(config)));
    }
  }, [isVisible, config]);

  const handleSave = async () => {
    try {
      await saveConfig(localConfig);
      toast.success('Settings saved successfully');
      onSave(localConfig);
    } catch (e) {
      toast.error('Failed to save settings: ' + e);
    }
  };

  // Expose save function to parent via ref
  useImperativeHandle(ref, () => ({
    save: handleSave
  }));

  const addCompany = async (isSupplier: boolean) => {
    const type = isSupplier ? 'Supplier' : 'Customer';
    const id = await prompt({
      title: `Add ${type}`,
      message: `Enter a unique ID for the new ${type.toLowerCase()}.`,
      placeholder: 'e.g. scio_zizkov',
      confirmText: 'Create',
      cancelText: 'Cancel'
    });
    
    if (!id) return;
    
    if (localConfig.companies.find(c => c.id === id)) {
      toast.error('A company with this ID already exists');
      return;
    }
    
    const newC: CompanyDetails = { 
      id, 
      name: isSupplier ? "My Company" : "New Customer", 
      street: "", city: "", zip: "", country: "", ic: "", 
      isSupplier 
    };
    
    setLocalConfig(prev => ({
      ...prev,
      companies: [...prev.companies, newC]
    }));
  };

  const updateCompany = (id: string, newC: CompanyDetails) => {
    setLocalConfig(prev => ({
      ...prev,
      companies: prev.companies.map(c => c.id === id ? newC : c)
    }));
  };

  const removeCompany = async (id: string) => {
    const company = localConfig.companies.find(c => c.id === id);
    const confirmed = await confirm({
      title: 'Delete Company',
      message: `Are you sure you want to delete "${company?.name || id}"? This action cannot be undone.`,
      confirmText: 'Delete',
      cancelText: 'Cancel',
      variant: 'danger'
    });
    
    if (confirmed) {
      setLocalConfig(prev => ({
        ...prev,
        companies: prev.companies.filter(c => c.id !== id)
      }));
    }
  };

  const addContact = async () => {
    const id = await prompt({
      title: 'Add Contact',
      message: 'Enter a unique ID for the new contact.',
      placeholder: 'e.g. john_doe',
      confirmText: 'Create',
      cancelText: 'Cancel'
    });
    
    if (!id) return;
    
    if (localConfig.contacts?.find(c => c.id === id)) {
      toast.error('A contact with this ID already exists');
      return;
    }
    
    const newContact: Contact = { 
      id, 
      name: "New Contact", 
      email: "" 
    };
    
    setLocalConfig(prev => ({
      ...prev,
      contacts: [...(prev.contacts || []), newContact]
    }));
  };

  const updateContact = (id: string, newContact: Contact) => {
    setLocalConfig(prev => ({
      ...prev,
      contacts: (prev.contacts || []).map(c => c.id === id ? newContact : c)
    }));
  };

  const removeContact = async (id: string) => {
    const contact = localConfig.contacts?.find(c => c.id === id);
    const confirmed = await confirm({
      title: 'Delete Contact',
      message: `Are you sure you want to delete "${contact?.name || id}"? This action cannot be undone.`,
      confirmText: 'Delete',
      cancelText: 'Cancel',
      variant: 'danger'
    });
    
    if (confirmed) {
      setLocalConfig(prev => ({
        ...prev,
        contacts: (prev.contacts || []).filter(c => c.id !== id),
        // Also remove contact references from companies
        companies: prev.companies.map(company => 
          company.contactId === id ? { ...company, contactId: undefined } : company
        )
      }));
    }
  };

  const tabs = [
    { id: 'general' as const, label: 'General', icon: Settings2 },
    { id: 'supplier' as const, label: 'Suppliers', icon: Building2 },
    { id: 'customers' as const, label: 'Customers', icon: Users },
    { id: 'contacts' as const, label: 'Contacts', icon: Mail },
    { id: 'rulesets' as const, label: 'Rulesets', icon: Layers },
  ];

  const themeOptions: { value: Theme; icon: React.ReactNode; label: string }[] = [
    { value: 'light', icon: <Sun size={18} />, label: 'Light' },
    { value: 'dark', icon: <Moon size={18} />, label: 'Dark' },
    { value: 'system', icon: <Monitor size={18} />, label: 'System' },
  ];

  return (
    <div className="p-6 lg:p-8">
      {/* Tab Navigation */}
      <div className="tab-list mb-6">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`tab-button flex items-center gap-2 ${activeTab === tab.id ? 'active' : ''}`}
            >
              <Icon size={18} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      <div className="card p-6 lg:p-8">
        {activeTab === 'general' && (
          <div className="space-y-6 max-w-2xl">
            {/* Theme Selector */}
            <div>
              <label 
                className="flex items-center gap-2 text-sm font-semibold mb-3"
                style={{ color: 'var(--text-secondary)' }}
              >
                <Palette size={16} />
                Appearance
              </label>
              <div 
                className="flex gap-2 p-1.5 rounded-xl w-fit"
                style={{ backgroundColor: 'var(--bg-muted)' }}
              >
                {themeOptions.map((option) => (
                  <button
                    key={option.value}
                    onClick={() => setTheme(option.value)}
                    className={`
                      flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all
                      ${theme === option.value 
                        ? 'shadow-md' 
                        : 'hover:bg-white/50 dark:hover:bg-white/10'
                      }
                    `}
                    style={{ 
                      backgroundColor: theme === option.value ? 'var(--bg-surface)' : 'transparent',
                      color: theme === option.value ? 'var(--accent-600)' : 'var(--text-muted)'
                    }}
                  >
                    {option.icon}
                    <span>{option.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div 
              className="border-t"
              style={{ borderColor: 'var(--border-default)' }}
            />

            <PathInput 
              label="Root Directory"
              value={localConfig.rootPath}
              onChange={val => setLocalConfig({...localConfig, rootPath: val})}
              isDirectory
              icon={FolderOpen}
            />

            <SofficePathInput
              value={localConfig.sofficePath || ''}
              onChange={val => setLocalConfig({...localConfig, sofficePath: val || undefined})}
            />
            
            <div 
              className="p-4 rounded-lg"
              style={{ backgroundColor: 'var(--bg-muted)' }}
            >
              <label 
                className="flex items-center gap-2 text-sm font-semibold mb-4"
                style={{ color: 'var(--text-secondary)' }}
              >
                <Percent size={16} />
                Exchange Rates
              </label>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label 
                    className="text-xs font-medium mb-1 block"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    EUR → CZK
                  </label>
                  <input
                    type="number"
                    value={localConfig.exchangeRates.EUR}
                    onChange={e => setLocalConfig({
                      ...localConfig, 
                      exchangeRates: {...localConfig.exchangeRates, EUR: Number(e.target.value)}
                    })}
                  />
                </div>
                <div>
                  <label 
                    className="text-xs font-medium mb-1 block"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    USD → CZK
                  </label>
                  <input
                    type="number"
                    value={localConfig.exchangeRates.USD}
                    onChange={e => setLocalConfig({
                      ...localConfig, 
                      exchangeRates: {...localConfig.exchangeRates, USD: Number(e.target.value)}
                    })}
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'supplier' && (
          <div>
            <CompanyListEditor 
              companies={localConfig.companies.filter(c => c.isSupplier)} 
              onAdd={() => addCompany(true)}
              onUpdate={updateCompany}
              onRemove={removeCompany}
              title="Suppliers"
              emptyMessage="No suppliers configured. Add your company details to start generating invoices."
            />
          </div>
        )}

        {activeTab === 'customers' && (
          <div>
            <CompanyListEditor 
              companies={localConfig.companies.filter(c => !c.isSupplier)} 
              contacts={localConfig.contacts || []}
              onAdd={() => addCompany(false)}
              onUpdate={updateCompany}
              onRemove={removeCompany}
              title="Customers"
              emptyMessage="No customers configured. Add your clients to generate invoices for them."
            />
          </div>
        )}

        {activeTab === 'contacts' && (
          <div>
            <ContactsEditor 
              contacts={localConfig.contacts || []}
              onAdd={addContact}
              onUpdate={updateContact}
              onRemove={removeContact}
            />
          </div>
        )}

        {activeTab === 'rulesets' && (
          <div>
            <RulesetsEditor 
              rulesets={localConfig.rulesets}
              companies={localConfig.companies}
              onChange={rulesets => setLocalConfig({...localConfig, rulesets})}
            />
          </div>
        )}
      </div>
    </div>
  );
});

export default ConfigEditor;

// --- Sub-Components ---

interface PathInputProps {
  value: string;
  onChange: (val: string) => void;
  isDirectory?: boolean;
  label: string;
  icon?: React.ComponentType<{ size?: number }>;
}

function PathInput({ value, onChange, isDirectory = false, label, icon: Icon }: PathInputProps) {
  const [isValid, setIsValid] = useState<boolean | null>(null);

  useEffect(() => {
    if (!value) { setIsValid(null); return; }
    exists(value).then(setIsValid).catch(() => setIsValid(false));
  }, [value]);

  const handleBrowse = async () => {
    const selected = await open({
      directory: isDirectory,
      multiple: false,
      defaultPath: value || undefined,
      filters: isDirectory ? undefined : [{ name: 'ODT Template', extensions: ['odt'] }]
    });
    if (selected && typeof selected === 'string') {
      onChange(selected);
    }
  };

  return (
    <div>
      <label 
        className="flex items-center gap-2 text-sm font-semibold mb-2"
        style={{ color: 'var(--text-secondary)' }}
      >
        {Icon && <Icon size={16} />}
        {label}
      </label>
      <div className="flex gap-2 items-center">
        <div className="relative flex-1">
          <input
            type="text"
            value={value}
            onChange={e => onChange(e.target.value)}
            className={`pr-10 ${isValid === true ? 'validation-valid' : isValid === false ? 'validation-invalid' : ''}`}
          />
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            {isValid === true && <Check size={18} className="validation-valid-icon" />}
            {isValid === false && <AlertTriangle size={18} className="validation-invalid-icon" />}
          </div>
        </div>
        <button onClick={handleBrowse} className="btn btn-secondary btn-icon">
          <FolderOpen size={18} />
        </button>
      </div>
    </div>
  );
}

interface SofficePathInputProps {
  value: string;
  onChange: (val: string) => void;
}

// Common LibreOffice installation paths on Windows
const SOFFICE_COMMON_PATHS = [
  'C:\\Program Files\\LibreOffice\\program\\soffice.exe',
  'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe',
  'C:\\Program Files\\LibreOffice 7\\program\\soffice.exe',
  'C:\\Program Files\\LibreOffice 24\\program\\soffice.exe',
  'C:\\Program Files\\OpenOffice\\program\\soffice.exe',
  'C:\\Program Files (x86)\\OpenOffice\\program\\soffice.exe',
];

function SofficePathInput({ value, onChange }: SofficePathInputProps) {
  const [isValid, setIsValid] = useState<boolean | null>(null);
  const [isDetecting, setIsDetecting] = useState(false);

  useEffect(() => {
    if (!value) { setIsValid(null); return; }
    exists(value).then(setIsValid).catch(() => setIsValid(false));
  }, [value]);

  const handleBrowse = async () => {
    const selected = await open({
      multiple: false,
      defaultPath: value || 'C:\\Program Files',
      filters: [{ name: 'Executable', extensions: ['exe'] }]
    });
    if (selected && typeof selected === 'string') {
      onChange(selected);
    }
  };

  const handleAutoDetect = async () => {
    setIsDetecting(true);
    try {
      for (const path of SOFFICE_COMMON_PATHS) {
        if (await exists(path)) {
          onChange(path);
          toast.success('LibreOffice found!');
          setIsDetecting(false);
          return;
        }
      }
      toast.error('LibreOffice not found in common locations. Please browse manually.');
    } catch (e) {
      toast.error('Auto-detection failed');
    }
    setIsDetecting(false);
  };

  return (
    <div>
      <label 
        className="flex items-center gap-2 text-sm font-semibold mb-2"
        style={{ color: 'var(--text-secondary)' }}
      >
        <Terminal size={16} />
        LibreOffice Path
      </label>
      <div className="flex gap-2 items-center">
        <div className="relative flex-1">
          <input
            type="text"
            value={value}
            onChange={e => onChange(e.target.value)}
            placeholder="soffice (uses PATH if empty)"
            className={`pr-10 ${isValid === true ? 'validation-valid' : isValid === false ? 'validation-invalid' : ''}`}
          />
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            {isValid === true && <Check size={18} className="validation-valid-icon" />}
            {isValid === false && <AlertTriangle size={18} className="validation-invalid-icon" />}
          </div>
        </div>
        <button 
          onClick={handleAutoDetect} 
          className="btn btn-secondary btn-icon"
          disabled={isDetecting}
          title="Auto-detect LibreOffice"
        >
          <Wand2 size={18} className={isDetecting ? 'animate-spin' : ''} />
        </button>
        <button onClick={handleBrowse} className="btn btn-secondary btn-icon" title="Browse...">
          <FolderOpen size={18} />
        </button>
      </div>
      <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
        Path to soffice.exe for PDF conversion. Leave empty to use system PATH.
      </p>
    </div>
  );
}

interface ToggleCheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  title: string;
  description?: string;
  icon?: React.ComponentType<{ size?: number; style?: React.CSSProperties }>;
  children?: React.ReactNode;
}

function ToggleCheckbox({ checked, onChange, title, description, icon: Icon, children }: ToggleCheckboxProps) {
  return (
    <div className={`toggle-checkbox ${checked ? 'active' : ''}`}>
      <label className="flex items-center gap-3 cursor-pointer">
        <input 
          type="checkbox" 
          checked={checked}
          onChange={e => onChange(e.target.checked)}
          className="w-5 h-5"
        />
        <div className="flex-1">
          <div className="flex items-center gap-2">
            {Icon && <Icon size={16} style={{ color: 'var(--text-secondary)' }} />}
            <span className="font-medium" style={{ color: 'var(--text-primary)' }}>
              {title}
            </span>
          </div>
          {description && (
            <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
              {description}
            </p>
          )}
        </div>
      </label>
      {checked && children && (
        <div className="mt-3 ml-8">
          {children}
        </div>
      )}
    </div>
  );
}

interface CompanyListEditorProps {
  companies: CompanyDetails[];
  contacts?: Contact[];
  onAdd: () => void;
  onUpdate: (id: string, c: CompanyDetails) => void;
  onRemove: (id: string) => void;
  title: string;
  emptyMessage: string;
}

function CompanyListEditor({ companies, contacts, onAdd, onUpdate, onRemove, title, emptyMessage }: CompanyListEditorProps) {
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h3 
            className="text-lg font-bold"
            style={{ color: 'var(--text-primary)' }}
          >
            {title}
          </h3>
          <p 
            className="text-sm"
            style={{ color: 'var(--text-muted)' }}
          >
            {companies.length} {title.toLowerCase()} configured
          </p>
        </div>
        <button onClick={onAdd} className="btn btn-success">
          <Plus size={18} />
          <span>Add {title === 'Suppliers' ? 'Supplier' : 'Customer'}</span>
        </button>
      </div>

      {companies.length === 0 ? (
        <div 
          className="p-8 rounded-lg text-center"
          style={{ backgroundColor: 'var(--bg-muted)' }}
        >
          <Building2 size={48} className="mx-auto mb-3" style={{ color: 'var(--text-subtle)' }} />
          <p style={{ color: 'var(--text-muted)' }}>{emptyMessage}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {companies.map((c) => (
            <CompanyCard 
              key={c.id} 
              company={c}
              contacts={contacts}
              onChange={newC => onUpdate(c.id, newC)} 
              onRemove={() => onRemove(c.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface CompanyCardProps {
  company: CompanyDetails;
  contacts?: Contact[];
  onChange: (c: CompanyDetails) => void;
  onRemove: () => void;
}

function CompanyCard({ company, contacts, onChange, onRemove }: CompanyCardProps) {
  const update = (field: keyof CompanyDetails, val: any) => onChange({ ...company, [field]: val });
  
  // Contact options for Select component (only for customers)
  const contactOptions = useMemo(() => {
    if (!contacts || company.isSupplier) return [];
    return contacts.map(c => ({ value: c.id, label: `${c.name} (${c.email})` }));
  }, [contacts, company.isSupplier]);

  return (
    <div className="card p-5 space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <span 
            className="badge badge-primary"
          >
            {company.id}
          </span>
        </div>
        <button 
          onClick={onRemove} 
          className="btn btn-ghost btn-icon"
          style={{ color: 'var(--error-500)' }}
        >
          <Trash2 size={18} />
        </button>
      </div>
      
      <div>
        <label 
          className="text-xs font-semibold uppercase tracking-wide mb-1 block"
          style={{ color: 'var(--text-muted)' }}
        >
          Company Name
        </label>
        <input 
          value={company.name} 
          onChange={e => update('name', e.target.value)} 
          placeholder="Company Name"
        />
      </div>

      <div>
        <label 
          className="text-xs font-semibold uppercase tracking-wide mb-1 block"
          style={{ color: 'var(--text-muted)' }}
        >
          Street Address
        </label>
        <input 
          value={company.street} 
          onChange={e => update('street', e.target.value)}
          placeholder="Street and number"
        />
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="col-span-2">
          <label 
            className="text-xs font-semibold uppercase tracking-wide mb-1 block"
            style={{ color: 'var(--text-muted)' }}
          >
            City
          </label>
          <input 
            value={company.city} 
            onChange={e => update('city', e.target.value)}
            placeholder="City"
          />
        </div>
        <div>
          <label 
            className="text-xs font-semibold uppercase tracking-wide mb-1 block"
            style={{ color: 'var(--text-muted)' }}
          >
            ZIP
          </label>
          <input 
            value={company.zip} 
            onChange={e => update('zip', e.target.value)}
            placeholder="ZIP"
          />
        </div>
      </div>

      <div>
        <label 
          className="text-xs font-semibold uppercase tracking-wide mb-1 block"
          style={{ color: 'var(--text-muted)' }}
        >
          Country
        </label>
        <input 
          value={company.country} 
          onChange={e => update('country', e.target.value)}
          placeholder="Country"
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label 
            className="text-xs font-semibold uppercase tracking-wide mb-1 block"
            style={{ color: 'var(--text-muted)' }}
          >
            IČ (Company ID)
          </label>
          <input 
            value={company.ic} 
            onChange={e => update('ic', e.target.value)}
            placeholder="12345678"
          />
        </div>
        <div>
          <label 
            className="text-xs font-semibold uppercase tracking-wide mb-1 block"
            style={{ color: 'var(--text-muted)' }}
          >
            DIČ (VAT ID)
          </label>
          <input 
            value={company.dic || ''} 
            onChange={e => update('dic', e.target.value)}
            placeholder="CZ12345678"
          />
        </div>
      </div>

      {/* Bank account for suppliers only */}
      {company.isSupplier && (
        <div>
          <label 
            className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide mb-1"
            style={{ color: 'var(--text-muted)' }}
          >
            <CreditCard size={14} />
            Bank Account
          </label>
          <input 
            value={company.bankAccount || ''} 
            onChange={e => update('bankAccount', e.target.value || undefined)}
            placeholder="123456789 / 0100"
          />
        </div>
      )}

      {/* Contact selector for customers only */}
      {!company.isSupplier && contacts && (
        <div>
          <label 
            className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide mb-1"
            style={{ color: 'var(--text-muted)' }}
          >
            <Mail size={14} />
            Contact Person
          </label>
          <Select
            value={findOption(contactOptions, company.contactId)}
            onChange={(opt) => update('contactId', opt?.value || undefined)}
            options={contactOptions}
            placeholder="No contact assigned"
            isClearable
            isSearchable={false}
          />
          <p className="text-xs mt-1" style={{ color: 'var(--text-subtle)' }}>
            Assigned contact for automated emails
          </p>
        </div>
      )}
    </div>
  );
}

// --- Contacts Editor ---

interface ContactsEditorProps {
  contacts: Contact[];
  onAdd: () => void;
  onUpdate: (id: string, c: Contact) => void;
  onRemove: (id: string) => void;
}

function ContactsEditor({ contacts, onAdd, onUpdate, onRemove }: ContactsEditorProps) {
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h3 
            className="text-lg font-bold"
            style={{ color: 'var(--text-primary)' }}
          >
            Contacts
          </h3>
          <p 
            className="text-sm"
            style={{ color: 'var(--text-muted)' }}
          >
            {contacts.length} contact{contacts.length !== 1 ? 's' : ''} configured
          </p>
        </div>
        <button onClick={onAdd} className="btn btn-success">
          <Plus size={18} />
          <span>Add Contact</span>
        </button>
      </div>

      {contacts.length === 0 ? (
        <div 
          className="p-8 rounded-lg text-center"
          style={{ backgroundColor: 'var(--bg-muted)' }}
        >
          <Mail size={48} className="mx-auto mb-3" style={{ color: 'var(--text-subtle)' }} />
          <p style={{ color: 'var(--text-muted)' }}>
            No contacts configured. Add contacts to assign them to customers for automated emails.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
          {contacts.map((contact) => (
            <ContactCard 
              key={contact.id} 
              contact={contact} 
              onChange={newC => onUpdate(contact.id, newC)} 
              onRemove={() => onRemove(contact.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface ContactCardProps {
  contact: Contact;
  onChange: (c: Contact) => void;
  onRemove: () => void;
}

function ContactCard({ contact, onChange, onRemove }: ContactCardProps) {
  const update = (field: keyof Contact, val: any) => onChange({ ...contact, [field]: val });

  return (
    <div className="card p-5 space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <span className="badge badge-primary">
            {contact.id}
          </span>
        </div>
        <button 
          onClick={onRemove} 
          className="btn btn-ghost btn-icon"
          style={{ color: 'var(--error-500)' }}
        >
          <Trash2 size={18} />
        </button>
      </div>
      
      <div>
        <label 
          className="text-xs font-semibold uppercase tracking-wide mb-1 block"
          style={{ color: 'var(--text-muted)' }}
        >
          Name
        </label>
        <input 
          value={contact.name} 
          onChange={e => update('name', e.target.value)} 
          placeholder="Contact name"
        />
      </div>

      <div>
        <label 
          className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide mb-1"
          style={{ color: 'var(--text-muted)' }}
        >
          <Mail size={12} />
          Email
        </label>
        <input 
          type="email"
          value={contact.email} 
          onChange={e => update('email', e.target.value)}
          placeholder="email@example.com"
        />
      </div>

      <div>
        <label 
          className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide mb-1"
          style={{ color: 'var(--text-muted)' }}
        >
          <Phone size={12} />
          Phone
          <span className="font-normal normal-case" style={{ color: 'var(--text-subtle)' }}>(optional)</span>
        </label>
        <input 
          type="tel"
          value={contact.phone || ''} 
          onChange={e => update('phone', e.target.value || undefined)}
          placeholder="+420 123 456 789"
        />
      </div>
    </div>
  );
}

// --- Rulesets Editor ---

interface RulesetsEditorProps {
  rulesets: Ruleset[];
  companies: CompanyDetails[];
  onChange: (r: Ruleset[]) => void;
}

function RulesetsEditor({ rulesets, companies, onChange }: RulesetsEditorProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set(rulesets.map(r => r.id)));
  const [hasInteracted, setHasInteracted] = useState(false);
  
  const toggleExpanded = (id: string) => {
    setHasInteracted(true);
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const updateRuleset = (index: number, field: keyof Ruleset, value: any) => {
    const newR = [...rulesets];
    newR[index] = { ...newR[index], [field]: value };
    onChange(newR);
  };

  return (
    <div className="space-y-4">
      {rulesets.map((rs, i) => {
        const isExpanded = expandedIds.has(rs.id);
        return (
        <div 
          key={rs.id} 
          className="card ruleset-accordion"
        >
          {/* Ruleset Header - Clickable */}
          <button 
            type="button"
            onClick={() => toggleExpanded(rs.id)}
            className={`w-full px-6 py-4 flex items-center justify-between cursor-pointer ruleset-header ${isExpanded ? 'expanded' : ''}`}
          >
            <div className="flex items-center gap-3">
              <Layers size={24} className="ruleset-icon" />
              <div className="text-left">
                <h3 className="text-lg font-bold ruleset-title">{rs.name}</h3>
                <p className="text-sm ruleset-subtitle">ID: {rs.id}</p>
              </div>
            </div>
            <div className={`ruleset-chevron ${isExpanded ? 'expanded' : ''}`}>
              <ChevronDown size={24} />
            </div>
          </button>

          {/* Collapsible Content */}
          {isExpanded && (
            <div className={`p-6 space-y-6 ${hasInteracted ? 'ruleset-content-inner' : ''}`}>
            {/* Basic Settings */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label 
                  className="flex items-center gap-2 text-sm font-semibold mb-2"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  <Clock size={16} />
                  Periodicity
                </label>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <Select
                      value={findOption(PERIODICITY_OPTIONS, rs.periodicity)}
                      onChange={(opt) => opt && updateRuleset(i, 'periodicity', opt.value)}
                      options={PERIODICITY_OPTIONS}
                      isSearchable={false}
                    />
                  </div>
                  {(rs.periodicity === 'custom_months' || rs.periodicity === 'custom_days') && (
                    <input 
                      type="number"
                      className="w-20"
                      value={rs.periodicityCustomValue || 1}
                      onChange={e => updateRuleset(i, 'periodicityCustomValue', Number(e.target.value))}
                    />
                  )}
                </div>
              </div>

              <div>
                <label 
                  className="flex items-center gap-2 text-sm font-semibold mb-2"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  <Calendar size={16} />
                  Entitlement Day
                </label>
                <input 
                  type="number"
                  value={rs.entitlementDay}
                  onChange={e => updateRuleset(i, 'entitlementDay', Number(e.target.value))}
                  placeholder="Day of month"
                />
                <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                  Day of next month when you can invoice
                </p>
              </div>
            </div>

            {/* Due Date Offset & Template Path */}
            <div className="grid grid-cols-1 md:grid-cols-[200px_1fr] gap-4">
              <div>
                <label 
                  className="flex items-center gap-2 text-sm font-semibold mb-2"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  <Clock size={16} />
                  Due Date Offset (Days)
                </label>
                <input 
                  type="number"
                  value={rs.dueDateOffsetDays ?? 14}
                  onChange={e => updateRuleset(i, 'dueDateOffsetDays', Number(e.target.value))}
                  placeholder="14"
                  min={0}
                />
                <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                  Days from current date for due date
                </p>
              </div>

              <PathInput 
                label="ODT Template Path"
                value={rs.templatePath || ''}
                onChange={val => updateRuleset(i, 'templatePath', val)}
                icon={FileText}
              />
            </div>

            {/* Max Invoice Value (Optional) */}
            <ToggleCheckbox
              checked={rs.maxInvoiceValue !== undefined}
              onChange={checked => updateRuleset(i, 'maxInvoiceValue', checked ? 90000 : undefined)}
              title="Split Large Invoices"
              icon={DollarSign}
            >
              <label 
                className="text-xs font-medium mb-1 block"
                style={{ color: 'var(--text-muted)' }}
              >
                Max value per invoice
              </label>
              <input 
                type="number"
                className="max-w-[200px]"
                value={rs.maxInvoiceValue}
                onChange={e => updateRuleset(i, 'maxInvoiceValue', Number(e.target.value))}
                placeholder="90000"
                min={1}
              />
              <p className="text-xs mt-1" style={{ color: 'var(--text-subtle)' }}>
                Invoices exceeding this amount will be split into multiple documents
              </p>
            </ToggleCheckbox>

            {/* Minimize Invoices Toggle */}
            <ToggleCheckbox
              checked={!!rs.minimizeInvoices}
              onChange={checked => updateRuleset(i, 'minimizeInvoices', checked)}
              title="Minimize Invoice Count"
              description="Carry over remainders to reduce total number of invoices"
            />

            {/* Invoicing Rules */}
            <div 
              className="p-4 rounded-lg"
              style={{ backgroundColor: 'var(--bg-muted)' }}
            >
              <h4 
                className="font-bold mb-4 flex items-center gap-2"
                style={{ color: 'var(--text-primary)' }}
              >
                <Users size={18} />
                Invoicing Rules
                <span 
                  className="text-xs font-normal"
                  style={{ color: 'var(--text-muted)' }}
                >
                  (Top → Bottom Priority · Drag to reorder)
                </span>
              </h4>
              <CustomerRulesEditor 
                rules={rs.rules} 
                companies={companies}
                onChange={rules => updateRuleset(i, 'rules', rules)} 
              />
            </div>

            {/* Salary Rules */}
            <div 
              className="p-4 rounded-lg"
              style={{ backgroundColor: 'var(--bg-muted)' }}
            >
              <h4 
                className="font-bold mb-4 flex items-center gap-2"
                style={{ color: 'var(--text-primary)' }}
              >
                <DollarSign size={18} />
                Salary History
              </h4>
              <SalaryEditor 
                rules={rs.salaryRules}
                onChange={rules => updateRuleset(i, 'salaryRules', rules)}
              />
            </div>

            {/* Descriptions */}
            <div 
              className="p-4 rounded-lg"
              style={{ backgroundColor: 'var(--bg-muted)' }}
            >
              <h4 
                className="font-bold mb-4 flex items-center gap-2"
                style={{ color: 'var(--text-primary)' }}
              >
                <FileText size={18} />
                Service Descriptions
              </h4>
              <DescriptionsEditor 
                descriptions={rs.descriptions || []}
                onChange={descs => updateRuleset(i, 'descriptions', descs)}
              />
            </div>
            </div>
          )}
        </div>
        );
      })}
    </div>
  );
}

interface CustomerRulesEditorProps {
  rules: CustomerRule[];
  companies: CompanyDetails[];
  onChange: (r: CustomerRule[]) => void;
}

// Create stable IDs for rules (using index-based for simplicity since rules don't have unique IDs)
interface RuleWithId extends CustomerRule {
  id: string;  // Required by @dnd-kit/helpers move()
}

function CustomerRulesEditor({ rules, companies, onChange }: CustomerRulesEditorProps) {
  // Memoize targets to prevent recreating on every render
  const targets = useMemo(() => companies.filter(c => !c.isSupplier), [companies]);
  
  // Memoize target options for Select components
  const targetOptions = useMemo(
    () => targets.map(c => ({ value: c.id, label: c.name })),
    [targets]
  );
  
  const confirm = useConfirm();
  
  // Use refs to keep callbacks stable while still accessing latest values
  const rulesRef = useRef(rules);
  const targetsRef = useRef(targets);
  const onChangeRef = useRef(onChange);
  
  // Keep refs up to date
  rulesRef.current = rules;
  targetsRef.current = targets;
  onChangeRef.current = onChange;
  
  // Flag to skip sync when we made the change ourselves
  const skipNextSync = useRef(false);
  
  // Create stable IDs for sorting
  const [rulesWithIds, setRulesWithIds] = useState<RuleWithId[]>(() => 
    rules.map((rule, i) => ({ ...rule, id: `rule-${i}-${Date.now()}` }))
  );
  
  // Sync rulesWithIds when external rules change (not from our own drag)
  useEffect(() => {
    if (skipNextSync.current) {
      skipNextSync.current = false;
      return;
    }
    
    // Only regenerate if length changed (add/remove) or content changed
    setRulesWithIds(prev => {
      if (prev.length !== rules.length) {
        return rules.map((rule, i) => ({ ...rule, id: `rule-${i}-${Date.now()}` }));
      }
      // Update rule data while keeping stable IDs
      return prev.map((prevRule, i) => ({
        ...rules[i],
        id: prevRule.id
      }));
    });
  }, [rules]);

  // Stable callbacks that use refs
  const addRule = useCallback(() => {
    const currentRules = rulesRef.current;
    const currentTargets = targetsRef.current;
    onChangeRef.current([...currentRules, { condition: 'default', companyId: currentTargets[0]?.id || '' }]);
  }, []);
  
  const removeRule = useCallback(async (idx: number) => {
    const currentRules = rulesRef.current;
    const currentTargets = targetsRef.current;
    const rule = currentRules[idx];
    const targetCompany = currentTargets.find(t => t.id === rule.companyId);
    const confirmed = await confirm({
      title: 'Delete Invoicing Rule',
      message: `Are you sure you want to delete this rule? (${rule.condition} → ${targetCompany?.name || rule.companyId})`,
      confirmText: 'Delete',
      cancelText: 'Cancel',
      variant: 'danger'
    });
    
    if (confirmed) {
      const newR = [...currentRules];
      newR.splice(idx, 1);
      onChangeRef.current(newR);
    }
  }, [confirm]);
  
  const updateRule = useCallback((idx: number, field: keyof CustomerRule, val: any) => {
    const currentRules = rulesRef.current;
    const newR = [...currentRules];
    newR[idx] = { ...newR[idx], [field]: val };
    onChangeRef.current(newR);
  }, []);

  // Handle drag end with the new dnd-kit API
  const handleDragEnd = useCallback((event: any) => {
    if (event.canceled) return;
    
    setRulesWithIds(prev => {
      const newRulesWithIds = move(prev, event);
      if (newRulesWithIds !== prev) {
        // Set flag to skip the sync effect when parent updates
        skipNextSync.current = true;
        // Strip the id before calling onChange (keeping original CustomerRule shape)
        const newRules = (newRulesWithIds as RuleWithId[]).map(({ id, ...rule }) => rule as CustomerRule);
        onChangeRef.current(newRules);
        return newRulesWithIds as RuleWithId[];
      }
      return prev;
    });
  }, []);

  // Find the rule data for the ghost overlay
  const getRuleById = useCallback((id: string) => {
    return rulesWithIds.find(r => r.id === id);
  }, [rulesWithIds]);

  return (
    <div className="space-y-2">
      <DragDropProvider onDragEnd={handleDragEnd}>
        {rulesWithIds.map((rule, i) => (
          <SortableRuleItem
            key={rule.id}
            id={rule.id}
            rule={rule}
            index={i}
            targetOptions={targetOptions}
            onUpdate={updateRule}
            onRemove={removeRule}
          />
        ))}
        <DragOverlay>
          {(source) => {
            const rule = getRuleById(source.id as string);
            if (!rule) return null;
            return (
              <RuleItemGhost 
                rule={rule} 
                targetOptions={targetOptions} 
              />
            );
          }}
        </DragOverlay>
      </DragDropProvider>
      <button 
        onClick={addRule} 
        className="btn btn-ghost w-full justify-center"
        style={{ color: 'var(--accent-600)' }}
      >
        <Plus size={16} />
        <span>Add Rule</span>
      </button>
    </div>
  );
}

interface RuleItemGhostProps {
  rule: CustomerRule;
  targetOptions: SelectOption[];
}

// Ghost element that follows the cursor during drag
function RuleItemGhost({ rule, targetOptions }: RuleItemGhostProps) {
  return (
    <div className="invoicing-rule-item invoicing-rule-ghost">
      <div className="drag-handle">
        <GripVertical size={18} />
      </div>
      
      <div className="rule-condition-select">
        <Select
          value={findOption(CONDITION_OPTIONS, rule.condition)}
          onChange={() => {}}
          options={CONDITION_OPTIONS}
          isSearchable={false}
          size="sm"
          isDisabled
        />
      </div>
      
      <ArrowRight size={18} className="rule-arrow" />
      
      <div className="rule-company-select">
        <Select
          value={findOption(targetOptions, rule.companyId)}
          onChange={() => {}}
          options={targetOptions}
          isSearchable={false}
          size="sm"
          isDisabled
        />
      </div>
      
      <button 
        className="btn btn-ghost btn-icon rule-delete-btn"
        disabled
      >
        <Trash2 size={16} />
      </button>
    </div>
  );
}

interface SortableRuleItemProps {
  id: string;
  rule: CustomerRule;
  index: number;
  targetOptions: SelectOption[];
  onUpdate: (idx: number, field: keyof CustomerRule, val: any) => void;
  onRemove: (idx: number) => void;
}

// New dnd-kit/react API - transforms are handled automatically, no re-renders during drag!
function SortableRuleItem({ 
  id, rule, index, targetOptions, onUpdate, onRemove 
}: SortableRuleItemProps) {
  const { ref, handleRef, isDragging } = useSortable({ id, index });
  
  const handleConditionChange = useCallback(
    (opt: SelectOption | null) => opt && onUpdate(index, 'condition', opt.value),
    [index, onUpdate]
  );
  
  const handleCompanyChange = useCallback(
    (opt: SelectOption | null) => opt && onUpdate(index, 'companyId', opt.value),
    [index, onUpdate]
  );
  
  const handleRemove = useCallback(() => onRemove(index), [index, onRemove]);

  return (
    <div
      ref={ref}
      className={`invoicing-rule-item ${isDragging ? 'dragging' : ''}`}
      style={{ opacity: isDragging ? 0.5 : 1 }}
    >
      <div className="drag-handle" ref={handleRef}>
        <GripVertical size={18} />
      </div>
      
      <div className="rule-condition-select">
        <Select
          value={findOption(CONDITION_OPTIONS, rule.condition)}
          onChange={handleConditionChange}
          options={CONDITION_OPTIONS}
          isSearchable={false}
          size="sm"
        />
      </div>
      
      <ArrowRight size={18} className="rule-arrow" />
      
      <div className="rule-company-select">
        <Select
          value={findOption(targetOptions, rule.companyId)}
          onChange={handleCompanyChange}
          options={targetOptions}
          isSearchable={false}
          size="sm"
        />
      </div>
      
      <button 
        onClick={handleRemove} 
        className="btn btn-ghost btn-icon rule-delete-btn"
      >
        <Trash2 size={16} />
      </button>
    </div>
  );
}

interface SalaryEditorProps {
  rules: SalaryRule[];
  onChange: (r: SalaryRule[]) => void;
}

function SalaryEditor({ rules, onChange }: SalaryEditorProps) {
  const confirm = useConfirm();
  
  // Sort rules by start date (newest to oldest)
  const sortedRules = useMemo(() => {
    return [...rules].sort((a, b) => b.startDate.localeCompare(a.startDate));
  }, [rules]);
  
  // Find original index for operations
  const getOriginalIndex = (sortedIndex: number): number => {
    const sortedRule = sortedRules[sortedIndex];
    return rules.findIndex(r => r === sortedRule || 
      (r.startDate === sortedRule.startDate && r.endDate === sortedRule.endDate && 
       r.value === sortedRule.value && r.deduction === sortedRule.deduction));
  };
  
  const addRule = () => onChange([...rules, { startDate: "2025-01", endDate: "2025-12", value: 0, deduction: 0 }]);
  
  const removeRule = async (sortedIndex: number) => {
    const rule = sortedRules[sortedIndex];
    const originalIndex = getOriginalIndex(sortedIndex);
    const confirmed = await confirm({
      title: 'Delete Salary Period',
      message: `Are you sure you want to delete the salary period ${rule.startDate} → ${rule.endDate}? This action cannot be undone.`,
      confirmText: 'Delete',
      cancelText: 'Cancel',
      variant: 'danger'
    });
    
    if (confirmed) {
      const newR = [...rules];
      newR.splice(originalIndex, 1);
      onChange(newR);
    }
  };
  
  const updateRule = (sortedIndex: number, field: keyof SalaryRule, val: any) => {
    const originalIndex = getOriginalIndex(sortedIndex);
    const newR = [...rules];
    newR[originalIndex] = { ...newR[originalIndex], [field]: val };
    onChange(newR);
  };

  return (
    <div className="space-y-2">
      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>Start</th>
              <th>End</th>
              <th>Base Value</th>
              <th>Deduction</th>
              <th className="w-16"></th>
            </tr>
          </thead>
          <tbody>
            {sortedRules.map((r, i) => (
              <tr key={`${r.startDate}-${r.endDate}-${i}`}>
                <td>
                  <DatePicker
                    value={r.startDate}
                    onChange={(val) => updateRule(i, 'startDate', val)}
                    placeholder="Start"
                  />
                </td>
                <td>
                  <DatePicker
                    value={r.endDate}
                    onChange={(val) => updateRule(i, 'endDate', val)}
                    placeholder="End"
                  />
                </td>
                <td>
                  <input 
                    type="number" 
                    value={r.value} 
                    onChange={e => updateRule(i, 'value', Number(e.target.value))}
                    placeholder="0"
                  />
                </td>
                <td>
                  <input 
                    type="number" 
                    value={r.deduction} 
                    onChange={e => updateRule(i, 'deduction', Number(e.target.value))}
                    placeholder="0"
                  />
                </td>
                <td>
                  <button 
                    onClick={() => removeRule(i)} 
                    className="btn btn-ghost btn-icon"
                    style={{ color: 'var(--error-500)' }}
                  >
                    <Trash2 size={16} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button 
        onClick={addRule} 
        className="btn btn-ghost"
        style={{ color: 'var(--accent-600)' }}
      >
        <Plus size={16} />
        <span>Add Period</span>
      </button>
    </div>
  );
}

interface DescriptionsEditorProps {
  descriptions: string[];
  onChange: (d: string[]) => void;
}

function DescriptionsEditor({ descriptions, onChange }: DescriptionsEditorProps) {
  const confirm = useConfirm();
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const newInputRef = useRef<HTMLInputElement>(null);
  const [focusNew, setFocusNew] = useState(false);
  
  const addDesc = useCallback(() => {
    onChange([...descriptions, "New service description"]);
    setFocusNew(true);
  }, [descriptions, onChange]);
  
  // Focus and select the newly added input
  useEffect(() => {
    if (focusNew && newInputRef.current) {
      newInputRef.current.focus();
      newInputRef.current.select();
      setFocusNew(false);
    }
  }, [focusNew, descriptions]);
  
  // Handle Enter key to add new description
  useEventListener({
    type: 'keydown',
    target: container,
    handler: (e) => {
      if (e.key === 'Enter' && e.target instanceof HTMLInputElement) {
        e.preventDefault();
        addDesc();
      }
    },
    enabled: !!container
  });
  
  const removeDesc = async (i: number) => {
    const desc = descriptions[i];
    const truncatedDesc = desc.length > 50 ? desc.substring(0, 50) + '...' : desc;
    const confirmed = await confirm({
      title: 'Delete Service Description',
      message: `Are you sure you want to delete "${truncatedDesc}"? This action cannot be undone.`,
      confirmText: 'Delete',
      cancelText: 'Cancel',
      variant: 'danger'
    });
    
    if (confirmed) {
      const newD = [...descriptions];
      newD.splice(i, 1);
      onChange(newD);
    }
  };
  
  const updateDesc = (i: number, val: string) => {
    const newD = [...descriptions];
    newD[i] = val;
    onChange(newD);
  };

  return (
    <div ref={setContainer} className="space-y-2">
      {descriptions.map((d, i) => (
        <div key={i} className="flex gap-2">
          <input 
            ref={i === descriptions.length - 1 ? newInputRef : undefined}
            className="flex-1" 
            value={d} 
            onChange={e => updateDesc(i, e.target.value)}
            placeholder="Service description..."
          />
          <button 
            onClick={() => removeDesc(i)} 
            className="btn btn-ghost btn-icon"
            style={{ color: 'var(--error-500)' }}
          >
            <Trash2 size={16} />
          </button>
        </div>
      ))}
      <button 
        onClick={addDesc} 
        className="btn btn-ghost"
        style={{ color: 'var(--accent-600)' }}
      >
        <Plus size={16} />
        <span>Add Description</span>
      </button>
    </div>
  );
}
