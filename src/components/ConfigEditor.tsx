import { useState, useEffect, forwardRef, useImperativeHandle } from 'react';
import { Config, CompanyDetails, SalaryRule, CustomerRule, Ruleset } from '../types';
import { saveConfig } from '../utils/config';
import { open } from '@tauri-apps/plugin-dialog';
import { exists } from '@tauri-apps/plugin-fs';
import { useTheme, Theme } from '../contexts/ThemeContext';
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
  ChevronUp,
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
  Palette
} from 'lucide-react';

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
  const [activeTab, setActiveTab] = useState<'general' | 'supplier' | 'customers' | 'rulesets'>('general');
  const { theme, setTheme } = useTheme();

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

  const addCompany = (isSupplier: boolean) => {
    const id = prompt(`Enter unique ID for ${isSupplier ? 'Supplier' : 'Customer'} (e.g. 'scio_zizkov'):`);
    if (!id) return;
    if (localConfig.companies.find(c => c.id === id)) { alert("ID exists"); return; }
    
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

  const removeCompany = (id: string) => {
    if (confirm("Delete company?")) {
      setLocalConfig(prev => ({
        ...prev,
        companies: prev.companies.filter(c => c.id !== id)
      }));
    }
  };

  const tabs = [
    { id: 'general' as const, label: 'General', icon: Settings2 },
    { id: 'supplier' as const, label: 'Supplier', icon: Building2 },
    { id: 'customers' as const, label: 'Customers', icon: Users },
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
            
            <div>
              <label 
                className="flex items-center gap-2 text-sm font-semibold mb-2"
                style={{ color: 'var(--text-secondary)' }}
              >
                <CreditCard size={16} />
                Bank Account
              </label>
              <input
                type="text"
                value={localConfig.bankAccount}
                onChange={e => setLocalConfig({...localConfig, bankAccount: e.target.value})}
                placeholder="123456789 / 0100"
              />
            </div>
            
            <div>
              <label 
                className="flex items-center gap-2 text-sm font-semibold mb-2"
                style={{ color: 'var(--text-secondary)' }}
              >
                <DollarSign size={16} />
                Max Invoice Value
              </label>
              <input
                type="number"
                value={localConfig.maxInvoiceValue}
                onChange={e => setLocalConfig({...localConfig, maxInvoiceValue: Number(e.target.value)})}
              />
              <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                Invoices exceeding this amount will be split into multiple documents
              </p>
            </div>
            
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
              onAdd={() => addCompany(false)}
              onUpdate={updateCompany}
              onRemove={removeCompany}
              title="Customers"
              emptyMessage="No customers configured. Add your clients to generate invoices for them."
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
            className="pr-10"
            style={{
              borderColor: isValid === false ? 'var(--error-500)' : isValid === true ? 'var(--success-500)' : undefined,
              backgroundColor: isValid === false ? 'var(--error-50)' : isValid === true ? 'var(--success-50)' : undefined,
            }}
          />
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            {isValid === true && <Check size={18} style={{ color: 'var(--success-500)' }} />}
            {isValid === false && <AlertTriangle size={18} style={{ color: 'var(--error-500)' }} />}
          </div>
        </div>
        <button onClick={handleBrowse} className="btn btn-secondary btn-icon">
          <FolderOpen size={18} />
        </button>
      </div>
    </div>
  );
}

interface CompanyListEditorProps {
  companies: CompanyDetails[];
  onAdd: () => void;
  onUpdate: (id: string, c: CompanyDetails) => void;
  onRemove: (id: string) => void;
  title: string;
  emptyMessage: string;
}

function CompanyListEditor({ companies, onAdd, onUpdate, onRemove, title, emptyMessage }: CompanyListEditorProps) {
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
  onChange: (c: CompanyDetails) => void;
  onRemove: () => void;
}

function CompanyCard({ company, onChange, onRemove }: CompanyCardProps) {
  const update = (field: keyof CompanyDetails, val: any) => onChange({ ...company, [field]: val });

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
    </div>
  );
}

interface RulesetsEditorProps {
  rulesets: Ruleset[];
  companies: CompanyDetails[];
  onChange: (r: Ruleset[]) => void;
}

function RulesetsEditor({ rulesets, companies, onChange }: RulesetsEditorProps) {
  const updateRuleset = (index: number, field: keyof Ruleset, value: any) => {
    const newR = [...rulesets];
    newR[index] = { ...newR[index], [field]: value };
    onChange(newR);
  };

  return (
    <div className="space-y-6">
      {rulesets.map((rs, i) => (
        <div 
          key={rs.id} 
          className="card overflow-hidden"
        >
          {/* Ruleset Header */}
          <div 
            className="px-6 py-4 flex items-center justify-between"
            style={{ 
              background: 'linear-gradient(135deg, var(--accent-500), var(--accent-600))',
            }}
          >
            <div className="flex items-center gap-3">
              <Layers size={24} className="text-white" />
              <div>
                <h3 className="text-lg font-bold text-white">{rs.name}</h3>
                <p className="text-sm text-white/70">ID: {rs.id}</p>
              </div>
            </div>
          </div>

          <div className="p-6 space-y-6">
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
                  <select 
                    value={rs.periodicity}
                    onChange={e => updateRuleset(i, 'periodicity', e.target.value)}
                    className="flex-1"
                  >
                    <option value="monthly">Monthly</option>
                    <option value="quarterly">Quarterly</option>
                    <option value="yearly">Yearly</option>
                    <option value="custom_months">Custom (Months)</option>
                    <option value="custom_days">Custom (Days)</option>
                  </select>
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

            {/* Template Path */}
            <PathInput 
              label="ODT Template Path"
              value={rs.templatePath || ''}
              onChange={val => updateRuleset(i, 'templatePath', val)}
              icon={FileText}
            />

            {/* Minimize Invoices Toggle */}
            <label 
              className="flex items-center gap-3 p-4 rounded-lg cursor-pointer transition-colors"
              style={{ backgroundColor: rs.minimizeInvoices ? 'var(--accent-50)' : 'var(--bg-muted)' }}
            >
              <input 
                type="checkbox" 
                checked={!!rs.minimizeInvoices}
                onChange={e => updateRuleset(i, 'minimizeInvoices', e.target.checked)}
                className="w-5 h-5"
              />
              <div>
                <p className="font-medium" style={{ color: 'var(--text-primary)' }}>
                  Minimize Invoice Count
                </p>
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                  Carry over remainders to reduce total number of invoices
                </p>
              </div>
            </label>

            {/* Customer Rules */}
            <div 
              className="p-4 rounded-lg"
              style={{ backgroundColor: 'var(--bg-muted)' }}
            >
              <h4 
                className="font-bold mb-4 flex items-center gap-2"
                style={{ color: 'var(--text-primary)' }}
              >
                <Users size={18} />
                Customer Rules
                <span 
                  className="text-xs font-normal"
                  style={{ color: 'var(--text-muted)' }}
                >
                  (Top → Bottom Priority)
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
        </div>
      ))}
    </div>
  );
}

interface CustomerRulesEditorProps {
  rules: CustomerRule[];
  companies: CompanyDetails[];
  onChange: (r: CustomerRule[]) => void;
}

function CustomerRulesEditor({ rules, companies, onChange }: CustomerRulesEditorProps) {
  const targets = companies.filter(c => !c.isSupplier);

  const addRule = () => onChange([...rules, { condition: 'default', companyId: targets[0]?.id || '' }]);
  
  const removeRule = (idx: number) => {
    const newR = [...rules];
    newR.splice(idx, 1);
    onChange(newR);
  };
  
  const updateRule = (idx: number, field: keyof CustomerRule, val: any) => {
    const newR = [...rules];
    newR[idx] = { ...newR[idx], [field]: val };
    onChange(newR);
  };
  
  const moveRule = (idx: number, dir: -1 | 1) => {
    if (idx + dir < 0 || idx + dir >= rules.length) return;
    const newR = [...rules];
    const temp = newR[idx];
    newR[idx] = newR[idx + dir];
    newR[idx + dir] = temp;
    onChange(newR);
  };

  return (
    <div className="space-y-2">
      {rules.map((rule, i) => (
        <div 
          key={i} 
          className="flex gap-2 items-center p-3 rounded-lg"
          style={{ backgroundColor: 'var(--bg-surface)' }}
        >
          <div className="flex flex-col gap-0.5">
            <button 
              onClick={() => moveRule(i, -1)} 
              disabled={i === 0} 
              className="btn btn-ghost btn-icon p-0.5"
              style={{ opacity: i === 0 ? 0.3 : 1 }}
            >
              <ChevronUp size={16} />
            </button>
            <button 
              onClick={() => moveRule(i, 1)} 
              disabled={i === rules.length - 1}
              className="btn btn-ghost btn-icon p-0.5"
              style={{ opacity: i === rules.length - 1 ? 0.3 : 1 }}
            >
              <ChevronDown size={16} />
            </button>
          </div>
          
          <select 
            className="w-36"
            value={rule.condition}
            onChange={e => updateRule(i, 'condition', e.target.value)}
          >
            <option value="odd">Odd Month</option>
            <option value="even">Even Month</option>
            <option value="default">Default (Always)</option>
          </select>
          
          <ArrowRight size={18} style={{ color: 'var(--text-muted)' }} />
          
          <select 
            className="flex-1"
            value={rule.companyId}
            onChange={e => updateRule(i, 'companyId', e.target.value)}
          >
            {targets.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          
          <button 
            onClick={() => removeRule(i)} 
            className="btn btn-ghost btn-icon"
            style={{ color: 'var(--error-500)' }}
          >
            <Trash2 size={16} />
          </button>
        </div>
      ))}
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

interface SalaryEditorProps {
  rules: SalaryRule[];
  onChange: (r: SalaryRule[]) => void;
}

function SalaryEditor({ rules, onChange }: SalaryEditorProps) {
  const addRule = () => onChange([...rules, { startDate: "2025-01", endDate: "2025-12", value: 0, deduction: 0 }]);
  
  const removeRule = (i: number) => {
    const newR = [...rules];
    newR.splice(i, 1);
    onChange(newR);
  };
  
  const updateRule = (i: number, field: keyof SalaryRule, val: any) => {
    const newR = [...rules];
    newR[i] = { ...newR[i], [field]: val };
    onChange(newR);
  };

  return (
    <div className="space-y-2">
      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>Start (YYYY-MM)</th>
              <th>End (YYYY-MM)</th>
              <th>Base Value</th>
              <th>Deduction</th>
              <th className="w-16"></th>
            </tr>
          </thead>
          <tbody>
            {rules.map((r, i) => (
              <tr key={i}>
                <td>
                  <input 
                    className="w-28" 
                    value={r.startDate} 
                    onChange={e => updateRule(i, 'startDate', e.target.value)}
                    placeholder="2025-01"
                  />
                </td>
                <td>
                  <input 
                    className="w-28" 
                    value={r.endDate} 
                    onChange={e => updateRule(i, 'endDate', e.target.value)}
                    placeholder="2025-12"
                  />
                </td>
                <td>
                  <input 
                    type="number" 
                    className="w-28" 
                    value={r.value} 
                    onChange={e => updateRule(i, 'value', Number(e.target.value))}
                    placeholder="0"
                  />
                </td>
                <td>
                  <input 
                    type="number" 
                    className="w-28" 
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
  const addDesc = () => onChange([...descriptions, "New service description"]);
  
  const removeDesc = (i: number) => {
    const newD = [...descriptions];
    newD.splice(i, 1);
    onChange(newD);
  };
  
  const updateDesc = (i: number, val: string) => {
    const newD = [...descriptions];
    newD[i] = val;
    onChange(newD);
  };

  return (
    <div className="space-y-2">
      {descriptions.map((d, i) => (
        <div key={i} className="flex gap-2">
          <input 
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
