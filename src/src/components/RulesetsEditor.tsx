import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Ruleset, CompanyDetails, SalaryRule, CustomerRule, Currency } from '../types';
import { DragDropProvider, DragOverlay } from '@dnd-kit/react';
import { useSortable } from '@dnd-kit/react/sortable';
import { move } from '@dnd-kit/helpers';
import { open } from '@tauri-apps/plugin-dialog';
import { exists } from '@tauri-apps/plugin-fs';
import { modal } from '../contexts/ModalContext';
import { ConfirmModal } from './modals/ConfirmModal';
import { useEventListener } from '../hooks';
import { DatePicker } from './DatePicker';
import { Select, SelectOption, findOption } from './Select';
import {
  FolderOpen,
  Layers,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  Check,
  AlertTriangle,
  Calendar,
  DollarSign,
  FileText,
  Clock,
  ArrowRight,
  GripVertical,
  Plus,
  Trash2,
  Users
} from 'lucide-react';

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

interface RulesetsEditorProps {
  rulesets: Ruleset[];
  companies: CompanyDetails[];
  primaryCurrency: Currency;
  onChange: (r: Ruleset[]) => void;
  onAdd: () => void;
  onRemove: (id: string) => void;
}

interface AccordionSectionProps {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  isOpen: boolean;
  onToggle: () => void;
  headerAction?: React.ReactNode;
  children: React.ReactNode;
}

function AccordionSection({
  title,
  subtitle,
  icon,
  isOpen,
  onToggle,
  headerAction,
  children,
}: AccordionSectionProps) {
  return (
    <div
      className="rounded-lg overflow-hidden"
      style={{
        backgroundColor: 'var(--bg-surface)',
        border: '1px solid var(--border-default)',
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between p-4 cursor-pointer select-none"
        style={{ backgroundColor: 'var(--bg-muted)' }}
        onClick={onToggle}
      >
        <div className="flex items-center gap-3">
          <div style={{ color: 'var(--accent-500)' }}>{icon}</div>
          <div>
            <h3
              className="text-lg font-bold"
              style={{ color: 'var(--text-primary)' }}
            >
              {title}
            </h3>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              {subtitle}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {headerAction && (
            <div onClick={(e) => e.stopPropagation()}>{headerAction}</div>
          )}
          <div style={{ color: 'var(--text-muted)' }}>
            {isOpen ? <ChevronDown size={24} /> : <ChevronRight size={24} />}
          </div>
        </div>
      </div>

      {/* Content */}
      {isOpen && (
        <div className="p-4">
          {children}
        </div>
      )}
    </div>
  );
}

export function RulesetsEditor({ rulesets, companies, primaryCurrency, onChange, onAdd, onRemove }: RulesetsEditorProps) {
  const [sectionOpen, setSectionOpen] = useState(true);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set(rulesets.map(r => r.id)));
  
  const toggleExpanded = (id: string) => {
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

  const updateRuleset = useCallback((index: number, updates: Partial<Ruleset>) => {
    const newR = [...rulesets];
    newR[index] = { ...newR[index], ...updates };
    onChange(newR);
  }, [rulesets, onChange]);

  return (
    <AccordionSection
      title="Rulesets"
      subtitle={`${rulesets.length} ruleset${rulesets.length !== 1 ? 's' : ''} configured`}
      icon={<Layers size={24} />}
      isOpen={sectionOpen}
      onToggle={() => setSectionOpen(!sectionOpen)}
      headerAction={
        <button onClick={onAdd} className="btn btn-success btn-sm">
          <Plus size={16} />
          <span>Add</span>
        </button>
      }
    >
      {rulesets.length === 0 ? (
        <div
          className="p-8 rounded-lg text-center"
          style={{ backgroundColor: 'var(--bg-muted)' }}
        >
          <Layers
            size={48}
            className="mx-auto mb-3"
            style={{ color: 'var(--text-subtle)' }}
          />
          <p style={{ color: 'var(--text-muted)' }}>
            No rulesets configured. Add a ruleset to define invoice generation rules.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {rulesets.map((rs, i) => {
            const isExpanded = expandedIds.has(rs.id);
            return (
              <RulesetCard
                key={rs.id}
                ruleset={rs}
                index={i}
                isExpanded={isExpanded}
                companies={companies}
                primaryCurrency={primaryCurrency}
                onToggle={() => toggleExpanded(rs.id)}
                onUpdate={updateRuleset}
                onRemove={() => onRemove(rs.id)}
              />
            );
          })}
        </div>
      )}
    </AccordionSection>
  );
}

// --- Ruleset Card (isolated component) ---

interface RulesetCardProps {
  ruleset: Ruleset;
  index: number;
  isExpanded: boolean;
  companies: CompanyDetails[];
  primaryCurrency: Currency;
  onToggle: () => void;
  onUpdate: (index: number, updates: Partial<Ruleset>) => void;
  onRemove: () => void;
}

function RulesetCard({ ruleset, index, isExpanded, companies, primaryCurrency, onToggle, onUpdate, onRemove }: RulesetCardProps) {
  // Refs for all number/text inputs to avoid re-renders on keystroke
  const periodicityCustomRef = useRef<HTMLInputElement>(null);
  const entitlementDayRef = useRef<HTMLInputElement>(null);
  const dueDateOffsetRef = useRef<HTMLInputElement>(null);
  const maxInvoiceValueRef = useRef<HTMLInputElement>(null);
  
  const commitField = useCallback((field: keyof Ruleset, value: any) => {
    onUpdate(index, { [field]: value });
  }, [index, onUpdate]);

  const commitNumberField = useCallback((field: keyof Ruleset, ref: React.RefObject<HTMLInputElement | null>) => {
    if (ref.current) {
      commitField(field, Number(ref.current.value));
    }
  }, [commitField]);

  return (
    <div
      className="rounded-lg overflow-hidden"
      style={{
        backgroundColor: 'var(--bg-surface)',
        border: '1px solid var(--border-default)',
      }}
    >
      {/* Header */}
      <div 
        onClick={onToggle}
        className="flex items-center justify-between p-4 cursor-pointer"
        style={{ backgroundColor: 'var(--bg-muted)' }}
      >
        <div className="flex items-center gap-3">
          <Layers size={20} style={{ color: 'var(--accent-500)' }} />
          <div>
            <span className="badge badge-primary mr-2">{ruleset.id}</span>
            <span
              className="font-medium"
              style={{ color: 'var(--text-primary)' }}
            >
              {ruleset.name || 'Unnamed Ruleset'}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            className="btn btn-ghost btn-icon"
            style={{ color: 'var(--error-500)' }}
            title="Delete ruleset"
          >
            <Trash2 size={18} />
          </button>
          {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
        </div>
      </div>

      {/* Content */}
      {isExpanded && (
        <div className="p-4 space-y-6">
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
                    value={findOption(PERIODICITY_OPTIONS, ruleset.periodicity)}
                    onChange={(opt) => opt && commitField('periodicity', opt.value)}
                    options={PERIODICITY_OPTIONS}
                    isSearchable={false}
                  />
                </div>
                {(ruleset.periodicity === 'custom_months' || ruleset.periodicity === 'custom_days') && (
                  <input 
                    ref={periodicityCustomRef}
                    type="number"
                    className="w-20"
                    defaultValue={ruleset.periodicityCustomValue || 1}
                    onBlur={() => commitNumberField('periodicityCustomValue', periodicityCustomRef)}
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
                ref={entitlementDayRef}
                type="number"
                defaultValue={ruleset.entitlementDay}
                onBlur={() => commitNumberField('entitlementDay', entitlementDayRef)}
                placeholder="Day of month"
              />
              <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                Day of next month when you can invoice
              </p>
            </div>
          </div>

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
                ref={dueDateOffsetRef}
                type="number"
                defaultValue={ruleset.dueDateOffsetDays ?? 14}
                onBlur={() => commitNumberField('dueDateOffsetDays', dueDateOffsetRef)}
                placeholder="14"
                min={0}
              />
              <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                Days from current date for due date
              </p>
            </div>

            <PathInput 
              label="ODT Template Path"
              defaultValue={ruleset.templatePath || ''}
              onCommit={val => commitField('templatePath', val)}
              icon={FileText}
            />
          </div>

          <ToggleCheckbox
            checked={ruleset.maxInvoiceValue !== undefined}
            onChange={checked => commitField('maxInvoiceValue', checked ? 90000 : undefined)}
            title="Split Large Invoices"
            icon={DollarSign}
          >
            <label 
              className="text-xs font-medium mb-1 block"
              style={{ color: 'var(--text-muted)' }}
            >
              Max value per invoice ({primaryCurrency})
            </label>
            <input 
              ref={maxInvoiceValueRef}
              type="number"
              className="max-w-[200px]"
              defaultValue={ruleset.maxInvoiceValue}
              onBlur={() => commitNumberField('maxInvoiceValue', maxInvoiceValueRef)}
              placeholder="90000"
              min={1}
            />
            <p className="text-xs mt-1" style={{ color: 'var(--text-subtle)' }}>
              Invoices exceeding this amount will be split into multiple documents
            </p>
          </ToggleCheckbox>

          <ToggleCheckbox
            checked={!!ruleset.minimizeInvoices}
            onChange={checked => commitField('minimizeInvoices', checked)}
            title="Minimize Invoice Count"
            description="Carry over remainders to reduce total number of invoices"
          />

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
              rules={ruleset.rules} 
              companies={companies}
              onChange={rules => commitField('rules', rules)} 
            />
          </div>

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
              rules={ruleset.salaryRules}
              primaryCurrency={primaryCurrency}
              onChange={rules => commitField('salaryRules', rules)}
            />
          </div>

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
              descriptions={ruleset.descriptions || []}
              onChange={descs => commitField('descriptions', descs)}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// --- Helper Components ---

interface PathInputProps {
  defaultValue: string;
  onCommit: (val: string) => void;
  label: string;
  icon?: React.ComponentType<{ size?: number }>;
}

function PathInput({ defaultValue, onCommit, label, icon: Icon }: PathInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isValid, setIsValid] = useState<boolean | null>(null);

  // Validate on mount and when defaultValue changes
  useEffect(() => {
    if (!defaultValue) { setIsValid(null); return; }
    exists(defaultValue).then(setIsValid).catch(() => setIsValid(false));
  }, [defaultValue]);

  const handleBlur = () => {
    const val = inputRef.current?.value || '';
    if (val !== defaultValue) {
      onCommit(val);
    }
    // Validate
    if (!val) { setIsValid(null); return; }
    exists(val).then(setIsValid).catch(() => setIsValid(false));
  };

  const handleBrowse = async () => {
    const currentValue = inputRef.current?.value || '';
    const selected = await open({
      multiple: false,
      defaultPath: currentValue || undefined,
      filters: [{ name: 'ODT Template', extensions: ['odt'] }]
    });
    if (selected && typeof selected === 'string') {
      if (inputRef.current) {
        inputRef.current.value = selected;
      }
      onCommit(selected);
      exists(selected).then(setIsValid).catch(() => setIsValid(false));
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
            ref={inputRef}
            type="text"
            defaultValue={defaultValue}
            onBlur={handleBlur}
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

// --- Customer Rules Editor with Drag & Drop ---

interface CustomerRulesEditorProps {
  rules: CustomerRule[];
  companies: CompanyDetails[];
  onChange: (r: CustomerRule[]) => void;
}

interface RuleWithId extends CustomerRule {
  id: string;
}

function CustomerRulesEditor({ rules, companies, onChange }: CustomerRulesEditorProps) {
  const targets = useMemo(() => companies.filter(c => !c.isSupplier), [companies]);
  
  const targetOptions = useMemo(
    () => targets.map(c => ({ value: c.id, label: c.name })),
    [targets]
  );
  
  const rulesRef = useRef(rules);
  const targetsRef = useRef(targets);
  const onChangeRef = useRef(onChange);
  
  rulesRef.current = rules;
  targetsRef.current = targets;
  onChangeRef.current = onChange;
  
  const skipNextSync = useRef(false);
  
  const [rulesWithIds, setRulesWithIds] = useState<RuleWithId[]>(() => 
    rules.map((rule, i) => ({ ...rule, id: `rule-${i}-${Date.now()}` }))
  );
  
  useEffect(() => {
    if (skipNextSync.current) {
      skipNextSync.current = false;
      return;
    }
    
    setRulesWithIds(prev => {
      if (prev.length !== rules.length) {
        return rules.map((rule, i) => ({ ...rule, id: `rule-${i}-${Date.now()}` }));
      }
      return prev.map((prevRule, i) => ({
        ...rules[i],
        id: prevRule.id
      }));
    });
  }, [rules]);

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
    const confirmed = await modal.open(ConfirmModal, {
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
  }, []);
  
  const updateRule = useCallback((idx: number, field: keyof CustomerRule, val: any) => {
    const currentRules = rulesRef.current;
    const newR = [...currentRules];
    newR[idx] = { ...newR[idx], [field]: val };
    onChangeRef.current(newR);
  }, []);

  const handleDragEnd = useCallback((event: any) => {
    if (event.canceled) return;
    
    setRulesWithIds(prev => {
      const newRulesWithIds = move(prev, event);
      if (newRulesWithIds !== prev) {
        skipNextSync.current = true;
        const newRules = (newRulesWithIds as RuleWithId[]).map(({ id, ...rule }) => rule as CustomerRule);
        onChangeRef.current(newRules);
        return newRulesWithIds as RuleWithId[];
      }
      return prev;
    });
  }, []);

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
            return <RuleItemGhost rule={rule} targetOptions={targetOptions} />;
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
      
      <button className="btn btn-ghost btn-icon rule-delete-btn" disabled>
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

// --- Salary Editor ---

interface SalaryEditorProps {
  rules: SalaryRule[];
  primaryCurrency: Currency;
  onChange: (r: SalaryRule[]) => void;
}

function SalaryEditor({ rules, primaryCurrency, onChange }: SalaryEditorProps) {
  const onChangeRef = useRef(onChange);
  const rulesRef = useRef(rules);
  
  onChangeRef.current = onChange;
  rulesRef.current = rules;
  
  const sortedRules = useMemo(() => {
    return [...rules].sort((a, b) => b.startDate.localeCompare(a.startDate));
  }, [rules]);
  
  const getOriginalIndex = useCallback((sortedIndex: number): number => {
    const sortedRule = sortedRules[sortedIndex];
    return rulesRef.current.findIndex(r => r === sortedRule || 
      (r.startDate === sortedRule.startDate && r.endDate === sortedRule.endDate && 
       r.value === sortedRule.value && r.deduction === sortedRule.deduction));
  }, [sortedRules]);
  
  const addRule = useCallback(() => {
    onChangeRef.current([...rulesRef.current, { startDate: "2025-01", endDate: "2025-12", value: 0, deduction: 0 }]);
  }, []);
  
  const removeRule = useCallback(async (sortedIndex: number) => {
    const rule = sortedRules[sortedIndex];
    const originalIndex = getOriginalIndex(sortedIndex);
    const confirmed = await modal.open(ConfirmModal, {
      title: 'Delete Salary Period',
      message: `Are you sure you want to delete the salary period ${rule.startDate} → ${rule.endDate}? This action cannot be undone.`,
      confirmText: 'Delete',
      cancelText: 'Cancel',
      variant: 'danger'
    });
    
    if (confirmed) {
      const newR = [...rulesRef.current];
      newR.splice(originalIndex, 1);
      onChangeRef.current(newR);
    }
  }, [sortedRules, getOriginalIndex]);
  
  const updateRule = useCallback((sortedIndex: number, field: keyof SalaryRule, val: any) => {
    const originalIndex = getOriginalIndex(sortedIndex);
    const newR = [...rulesRef.current];
    newR[originalIndex] = { ...newR[originalIndex], [field]: val };
    onChangeRef.current(newR);
  }, [getOriginalIndex]);

  return (
    <div className="space-y-2">
      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>Start</th>
              <th>End</th>
              <th>Base Value ({primaryCurrency})</th>
              <th>Deduction ({primaryCurrency})</th>
              <th className="w-16"></th>
            </tr>
          </thead>
          <tbody>
            {sortedRules.map((r, i) => (
              <SalaryRow
                key={`${r.startDate}-${r.endDate}-${i}`}
                rule={r}
                index={i}
                onUpdate={updateRule}
                onRemove={removeRule}
              />
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

interface SalaryRowProps {
  rule: SalaryRule;
  index: number;
  onUpdate: (index: number, field: keyof SalaryRule, val: any) => void;
  onRemove: (index: number) => void;
}

function SalaryRow({ rule, index, onUpdate, onRemove }: SalaryRowProps) {
  const valueRef = useRef<HTMLInputElement>(null);
  const deductionRef = useRef<HTMLInputElement>(null);
  
  return (
    <tr>
      <td>
        <DatePicker
          value={rule.startDate}
          onChange={(val) => onUpdate(index, 'startDate', val)}
          placeholder="Start"
        />
      </td>
      <td>
        <DatePicker
          value={rule.endDate}
          onChange={(val) => onUpdate(index, 'endDate', val)}
          placeholder="End"
        />
      </td>
      <td>
        <input 
          ref={valueRef}
          type="number" 
          defaultValue={rule.value} 
          onBlur={() => valueRef.current && onUpdate(index, 'value', Number(valueRef.current.value))}
          placeholder="0"
        />
      </td>
      <td>
        <input 
          ref={deductionRef}
          type="number" 
          defaultValue={rule.deduction} 
          onBlur={() => deductionRef.current && onUpdate(index, 'deduction', Number(deductionRef.current.value))}
          placeholder="0"
        />
      </td>
      <td>
        <button 
          onClick={() => onRemove(index)} 
          className="btn btn-ghost btn-icon"
          style={{ color: 'var(--error-500)' }}
        >
          <Trash2 size={16} />
        </button>
      </td>
    </tr>
  );
}

// --- Descriptions Editor ---

interface DescriptionsEditorProps {
  descriptions: string[];
  onChange: (d: string[]) => void;
}

function DescriptionsEditor({ descriptions, onChange }: DescriptionsEditorProps) {
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const newInputRef = useRef<HTMLInputElement>(null);
  const [focusNew, setFocusNew] = useState(false);
  
  const onChangeRef = useRef(onChange);
  const descriptionsRef = useRef(descriptions);
  
  onChangeRef.current = onChange;
  descriptionsRef.current = descriptions;
  
  const addDesc = useCallback(() => {
    onChangeRef.current([...descriptionsRef.current, "New service description"]);
    setFocusNew(true);
  }, []);
  
  useEffect(() => {
    if (focusNew && newInputRef.current) {
      newInputRef.current.focus();
      newInputRef.current.select();
      setFocusNew(false);
    }
  }, [focusNew, descriptions]);
  
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
  
  const removeDesc = useCallback(async (i: number) => {
    const desc = descriptionsRef.current[i];
    const truncatedDesc = desc.length > 50 ? desc.substring(0, 50) + '...' : desc;
    const confirmed = await modal.open(ConfirmModal, {
      title: 'Delete Service Description',
      message: `Are you sure you want to delete "${truncatedDesc}"? This action cannot be undone.`,
      confirmText: 'Delete',
      cancelText: 'Cancel',
      variant: 'danger'
    });
    
    if (confirmed) {
      const newD = [...descriptionsRef.current];
      newD.splice(i, 1);
      onChangeRef.current(newD);
    }
  }, []);

  return (
    <div ref={setContainer} className="space-y-2">
      {descriptions.map((d, i) => (
        <DescriptionRow
          key={i}
          index={i}
          defaultValue={d}
          isLast={i === descriptions.length - 1}
          inputRef={i === descriptions.length - 1 ? newInputRef : undefined}
          onChange={onChange}
          descriptions={descriptions}
          onRemove={removeDesc}
        />
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

interface DescriptionRowProps {
  index: number;
  defaultValue: string;
  isLast: boolean;
  inputRef?: React.RefObject<HTMLInputElement | null>;
  onChange: (d: string[]) => void;
  descriptions: string[];
  onRemove: (i: number) => void;
}

function DescriptionRow({ index, defaultValue, inputRef, onChange, descriptions, onRemove }: DescriptionRowProps) {
  const localRef = useRef<HTMLInputElement>(null);
  const ref = inputRef || localRef;
  
  const handleBlur = () => {
    if (ref.current) {
      const newD = [...descriptions];
      newD[index] = ref.current.value;
      onChange(newD);
    }
  };
  
  return (
    <div className="flex gap-2">
      <input 
        ref={ref}
        className="flex-1" 
        defaultValue={defaultValue}
        onBlur={handleBlur}
        placeholder="Service description..."
      />
      <button 
        onClick={() => onRemove(index)} 
        className="btn btn-ghost btn-icon"
        style={{ color: 'var(--error-500)' }}
      >
        <Trash2 size={16} />
      </button>
    </div>
  );
}
