import { useState, useEffect, useRef, useMemo, useCallback, forwardRef, useImperativeHandle } from 'react';
import { Config, CompanyDetails, Ruleset } from '../types';
import { mkdir, readFile } from '@tauri-apps/plugin-fs';
import { moveProplatitFile, getMonthDates, getLastInvoicedMonth, ensureYearFolder } from '../utils/logic';
import { generateInvoiceOdt, convertToPdf } from '../utils/odt';
import { analyzeExtraItems, isAnalysisAvailable, AnalysisProgress } from '../utils/analyzeExtraItems';
import { loadGlobalSettings } from '../utils/globalSettings';
import PDFPreviewModal from './PDFPreviewModal';
import GenerateAllModal from './GenerateAllModal';
import ExtraItemsList from './ExtraItemsList';
import { CauldronButton } from './CauldronButton';
import { useProplatitFiles } from '../hooks';
import NumberFlow from '@number-flow/react';
import { toast } from 'sonner';
import { 
  FileText, 
  Sparkles, 
  ChevronDown,
  Banknote,
  Calendar,
  Hash,
  FileSignature,
  Eye,
  CheckCircle2,
  Loader2,
  Package,
  Wand2,
  Pencil,
  X,
  Plus,
  Trash2,
  RefreshCw
} from 'lucide-react';
import { findOption, CreatableSelect, Select, SelectOption } from './Select';
import { DatePicker } from './DatePicker';
import { createPortal } from 'react-dom';

interface GeneratorProps {
  config: Config;
}

export interface GeneratorRef {
  refreshAnalysisAvailability: () => void;
}

interface InvoiceDraft {
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
interface DraftUserEdits {
  invoiceNoOverride?: string;
  variableSymbolOverride?: string;
  description?: string;
}

// Adhoc invoice that user can manually add to the working set
interface AdhocInvoice {
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

const Generator = forwardRef<GeneratorRef, GeneratorProps>(function Generator({ config }, ref) {
  const [currentDate] = useState(new Date());
  const [drafts, setDrafts] = useState<InvoiceDraft[]>([]);
  const [lastInvoicedMonth, setLastInvoicedMonth] = useState(0);
  const [lastInvoicedMonthLoading, setLastInvoicedMonthLoading] = useState(true);
  const [extraItemsExpanded, setExtraItemsExpanded] = useState(true);
  const [editingAmountId, setEditingAmountId] = useState<string | null>(null);
  // Total overrides by month key (rulesetId-year-month) - in STATE so it triggers recalculation
  const [totalOverrides, setTotalOverrides] = useState<Map<string, number>>(new Map());
  
  // Track user edits separately to preserve them across regenerations (for non-amount fields)
  const userEditsRef = useRef<Map<string, DraftUserEdits>>(new Map());
  // Store calculated totals (before user overrides) for reset functionality
  // Key: `${rulesetId}-${year}-${month}`, Value: calculated total for that period
  const calculatedTotalsRef = useRef<Map<string, number>>(new Map());
  // Store the period's own base salary (excluding carryover from previous periods).
  // Used to decide whether an override is "effective" - the override replaces this period's
  // own salary contribution while preserving carryover from prior periods.
  const computedBaseTotalsRef = useRef<Map<string, number>>(new Map());
  
  const [previewModalOpen, setPreviewModalOpen] = useState(false);
  const [previewPdfUrl, setPreviewPdfUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewStep, setPreviewStep] = useState<string>('');
  
  const [generateAllModalOpen, setGenerateAllModalOpen] = useState(false);
  const [generateAllInvoicesSnapshot, setGenerateAllInvoicesSnapshot] = useState<Array<{ id: string; label: string; amount: number }>>([]);
  const [generateAllExtraFilesSnapshot, setGenerateAllExtraFilesSnapshot] = useState<Array<{ path: string; name: string }>>([]);

  // AI Analysis state
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState<AnalysisProgress | null>(null);
  const [canAnalyze, setCanAnalyze] = useState(false);
  const [analyzingIndices, setAnalyzingIndices] = useState<Set<number>>(new Set());

  // Adhoc invoices state
  const [adhocInvoices, setAdhocInvoices] = useState<AdhocInvoice[]>([]);
  const [adhocModalOpen, setAdhocModalOpen] = useState(false);
  const [editingAdhocInvoice, setEditingAdhocInvoice] = useState<AdhocInvoice | null>(null);

  // Manual refresh state
  const [refreshing, setRefreshing] = useState(false);

  // Expose method to refresh analysis availability without re-rendering parent
  useImperativeHandle(ref, () => ({
    refreshAnalysisAvailability: () => {
      isAnalysisAvailable(config.rootPath).then(setCanAnalyze);
    }
  }));

  // Check if AI analysis is available on mount or when rootPath changes
  useEffect(() => {
    isAnalysisAvailable(config.rootPath).then(setCanAnalyze);
  }, [config.rootPath]);

  // Use the custom hook for proplatit files
  const {
    files: proplatitFiles,
    loading: proplatitLoading,
    loadFiles: loadProplatitFiles,
    updateItem: updateProplatitItem,
    totalValue: proplatitTotalValue,
    selectedFiles: selectedProplatitFiles
  } = useProplatitFiles({
    rootPath: config.rootPath,
    primaryCurrency: config.primaryCurrency,
    exchangeRates: config.exchangeRates,
    projectStructure: config.projectStructure,
  });

  const loading = proplatitLoading || lastInvoicedMonthLoading;
  const showPageLoading = loading && !generateAllModalOpen && !previewModalOpen;

  // Reusable function to reload the last invoiced month from disk
  const reloadLastInvoicedMonth = async () => {
    setLastInvoicedMonthLoading(true);
    const yStr = currentDate.getFullYear().toString().slice(-2);
    const lastM = await getLastInvoicedMonth(config.rootPath, yStr, config.projectStructure);
    setLastInvoicedMonth(lastM);
    setLastInvoicedMonthLoading(false);
  };

  // Manual refresh - rescans filesystem while preserving local state
  const handleRefresh = useCallback(async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      // Reload invoice data and extra files in parallel
      await Promise.all([
        reloadLastInvoicedMonth(),
        loadProplatitFiles()
      ]);
    } finally {
      setRefreshing(false);
    }
  }, [refreshing, loadProplatitFiles]);

  // AI-powered analysis of extra items
  const handleAnalyzeExtraItems = useCallback(async () => {
    if (analyzing || proplatitFiles.length === 0) return;

    setAnalyzing(true);

    try {
      // Only analyze items that don't have a value yet (0 or empty)
      const items = proplatitFiles
        .map((item, index) => ({
          filePath: item.file.path,
          fileName: item.file.name,
          index,
          value: item.value,
        }))
        .filter(item => !item.value || item.value === 0);

      if (items.length === 0) {
        toast.info('All items already have values');
        setAnalyzing(false);
        return;
      }

      setAnalysisProgress({ completed: 0, total: items.length });
      
      // Mark only filtered items as analyzing
      const itemIndices = new Set(items.map(item => item.index));
      setAnalyzingIndices(itemIndices);

      let successCount = 0;
      let errorCount = 0;

      await analyzeExtraItems(items, {
        rootPath: config.rootPath,
        primaryCurrency: config.primaryCurrency,
        concurrency: 8,
        onProgress: setAnalysisProgress,
        onItemComplete: (index, result) => {
          // Remove from analyzing set
          setAnalyzingIndices(prev => {
            const next = new Set(prev);
            next.delete(index);
            return next;
          });
          
          if (result.success && result.paymentInfo) {
            successCount++;
            // Update the item with extracted values
            updateProplatitItem(
              index,
              result.paymentInfo.paidAmount,
              result.paymentInfo.paidCurrency,
              result.paymentInfo.paidAmount > 0 // Auto-select if amount > 0
            );
          } else {
            errorCount++;
            console.error(`[Analysis] Item ${index} failed:`, result.error);
          }
        },
      });

      if (successCount > 0) {
        toast.success(`Analyzed ${successCount} items successfully`);
      }
      if (errorCount > 0) {
        toast.error(`Failed to analyze ${errorCount} items`);
      }
    } catch (e) {
      console.error('[Analysis] Fatal error:', e);
      toast.error(`Analysis failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setAnalyzing(false);
      setAnalysisProgress(null);
      setAnalyzingIndices(new Set());
    }
  }, [analyzing, proplatitFiles, updateProplatitItem]);

  // Load on mount and when config changes
  useEffect(() => {
    reloadLastInvoicedMonth();
  }, [config.rootPath, currentDate]);

  // Calculate base drafts (without extra value) - only recalculates when config/invoiced month changes
  const baseDrafts = useMemo(() => {
    if (lastInvoicedMonthLoading) return [];
    
    const newDrafts: InvoiceDraft[] = [];
    const year = currentDate.getFullYear();
    const currentMonth = currentDate.getMonth() + 1;

    // Rebuild calculated totals each run (used for effective override detection + reset UI)
    calculatedTotalsRef.current.clear();
    computedBaseTotalsRef.current.clear();

    for (const ruleset of config.rulesets) {
      const cutoffDay = ruleset.entitlementDay;
      const endMonth = currentDate.getDate() > cutoffDay ? currentMonth - 1 : currentMonth - 2;
      let startMonth = lastInvoicedMonth + 1;
      
      if (startMonth > endMonth) continue;

      const maxValue = ruleset.maxInvoiceValue;

      // Compute the last billing month in-range; "flush" means "last billing period", not "endMonth"
      let lastBillingMonth: number | null = null;
      for (let m = startMonth; m <= endMonth; m++) {
        if (isBillingMonth(m, ruleset)) lastBillingMonth = m;
      }
      if (lastBillingMonth === null) continue;

      // PASS 1: calculate baseline (no override) totals for each billing period (used for UI reset + effective override)
      {
        let accum = 0;
        for (let m = startMonth; m <= endMonth; m++) {
          const dateStr = `${year}-${m.toString().padStart(2, '0')}`;
          const salaryRule = ruleset.salaryRules.find(r => dateStr >= r.startDate && dateStr <= r.endDate)
            || { value: 0, deduction: 0 };
          accum += salaryRule.value - salaryRule.deduction;

          if (!isBillingMonth(m, ruleset)) continue;

          const periodKey = `${ruleset.id}-${year}-${m}`;
          calculatedTotalsRef.current.set(periodKey, accum);

          // Apply natural billing rules to determine carryover (no override)
          let remaining = accum;
          while (maxValue && remaining >= maxValue) remaining -= maxValue;

          const isFlush = m === lastBillingMonth;
          if (remaining > 0 && ruleset.minimizeInvoices && maxValue && !isFlush) {
            accum = remaining; // carry remainder forward
          } else {
            accum = 0; // reset after billing period
          }
        }
      }

      // PASS 2: generate drafts, applying overrides (overrides affect carryover, but still follow minimize+flush rules)
      {
        let accum = 0;
        let periodOwnSalary = 0; // Track this period's base salary (without carryover)
        for (let m = startMonth; m <= endMonth; m++) {
          const dateStr = `${year}-${m.toString().padStart(2, '0')}`;
          const salaryRule = ruleset.salaryRules.find(r => dateStr >= r.startDate && dateStr <= r.endDate)
            || { value: 0, deduction: 0 };

          const monthContribution = salaryRule.value - salaryRule.deduction;
          accum += monthContribution;
          periodOwnSalary += monthContribution;

          if (!isBillingMonth(m, ruleset)) continue;

          const periodKey = `${ruleset.id}-${year}-${m}`;
          // Snapshot the period's own base salary (excluding carryover) before reset
          const currentPeriodBaseSalary = periodOwnSalary;
          computedBaseTotalsRef.current.set(periodKey, currentPeriodBaseSalary);

          const overrideValue = totalOverrides.get(periodKey);
          // Treat override equal to the period's base salary as a no-op override
          // (Override is for the period's OWN contribution, not the total including carryover)
          const hasEffectiveOverride = overrideValue !== undefined && overrideValue !== currentPeriodBaseSalary;

          // Override replaces the period's own salary contribution, preserving carryover
          // periodTotal = carryover + (override OR original period salary)
          const carryover = accum - currentPeriodBaseSalary;
          const effectivePeriodSalary = hasEffectiveOverride ? overrideValue! : currentPeriodBaseSalary;
          const periodTotal = carryover + effectivePeriodSalary;
          accum = periodTotal;

          const isFlush = m === lastBillingMonth;

          // Generate maxValue chunks
          // In flush period: generate ALL chunks (labeled as "Remainder 1/N", etc.)
          // In non-flush with minimizeInvoices: generate only ONE chunk, carry rest forward
          let partIndex = 0;
          while (maxValue && accum >= maxValue) {
            // With minimizeInvoices on non-flush period, only generate first invoice
            if (ruleset.minimizeInvoices && !isFlush && partIndex > 0) {
              break; // Carry remaining accum forward
            }

            const amount = maxValue;
            accum -= amount;

            const { invoiceNo } = getMonthDates(year, m, partIndex);
            const desc = ruleset.descriptions && ruleset.descriptions.length > 0
              ? ruleset.descriptions[Math.floor(Math.random() * ruleset.descriptions.length)]
              : "Služby";

            const periodLabel = getInvoiceLabel(year, m, ruleset);
            let label = `${periodLabel} (${ruleset.name})`;

            // In flush period, splits are labeled as "Remainder ..."; otherwise "Part N"
            if (isFlush) {
              // totalParts includes the first invoice; remainder count is totalParts-1
              const totalParts = maxValue ? Math.ceil(periodTotal / maxValue) : 1;
              if (totalParts > 1 && partIndex > 0) {
                const remCount = totalParts - 1;
                label += remCount === 1 ? " Remainder" : ` Remainder ${partIndex}/${remCount}`;
              }
            } else if (partIndex > 0) {
              label += ` Part ${partIndex + 1}`;
            }

            newDrafts.push({
              id: `${ruleset.id}-${year}-${m}-${partIndex}`,
              rulesetId: ruleset.id,
              year,
              month: m,
              index: partIndex,
              amount,
              description: desc,
              invoiceNoOverride: invoiceNo,
              variableSymbolOverride: invoiceNo,
              status: 'pending',
              label,
              periodLabel,
              monthSalary: periodTotal,
              periodBaseSalary: currentPeriodBaseSalary,
              extraValue: undefined
            });
            partIndex++;
          }

          // Handle leftover (accum now contains remainder < maxValue, or full value if maxValue undefined)
          if (accum > 0) {
            // Override BELOW maxValue: bill immediately (user wants exactly this amount for this period)
            // Override AT/ABOVE maxValue: already billed maxValue chunks, carry remainder to flush
            // No override: carry forward if minimize invoices is on and not at flush period
            const overrideBelowMax = hasEffectiveOverride && maxValue && periodTotal < maxValue;
            const shouldCarry = !overrideBelowMax && ruleset.minimizeInvoices && maxValue && !isFlush;
            if (shouldCarry) {
              // Do NOT emit remainder invoice yet; carry it into next period
              // Reset periodOwnSalary so next period tracks its own base salary
              periodOwnSalary = 0;
              continue;
            }

            // Bill remainder (either not minimizing, no splitting, or flush period)
            const amount = Math.round(accum);
            accum = 0;

            const { invoiceNo } = getMonthDates(year, m, partIndex);
            const desc = ruleset.descriptions && ruleset.descriptions.length > 0
              ? ruleset.descriptions[Math.floor(Math.random() * ruleset.descriptions.length)]
              : "Služby";

            const periodLabel = getInvoiceLabel(year, m, ruleset);
            let label = `${periodLabel} (${ruleset.name})`;

            if (isFlush) {
              const totalParts = maxValue ? Math.ceil(periodTotal / maxValue) : 1;
              if (totalParts > 1 && partIndex > 0) {
                const remCount = totalParts - 1;
                label += remCount === 1 ? " Remainder" : ` Remainder ${partIndex}/${remCount}`;
              }
            } else if (partIndex > 0) {
              label += ` Part ${partIndex + 1}`;
            }

            newDrafts.push({
              id: `${ruleset.id}-${year}-${m}-${partIndex}`,
              rulesetId: ruleset.id,
              year,
              month: m,
              index: partIndex,
              amount,
              description: desc,
              invoiceNoOverride: invoiceNo,
              variableSymbolOverride: invoiceNo,
              status: 'pending',
              label,
              periodLabel,
              monthSalary: periodTotal,
              periodBaseSalary: currentPeriodBaseSalary,
              extraValue: undefined
            });
            // Reset periodOwnSalary after billing (but not accum, which may carry forward)
            periodOwnSalary = 0;
          } else {
            // No remainder; reset for next period
            accum = 0;
            periodOwnSalary = 0;
          }
        }
      }
    }
    
    return newDrafts;
  }, [lastInvoicedMonthLoading, lastInvoicedMonth, config, currentDate, totalOverrides]);

  // Apply extra value to base drafts and merge with user edits
  // This runs when base drafts change OR when extra value changes
  useEffect(() => {
    if (proplatitLoading || lastInvoicedMonthLoading) return;
    
    const applyExtraValueToDrafts = (base: InvoiceDraft[], extraValue: number): InvoiceDraft[] => {
      if (base.length === 0) return [];
      
      // Find drafts for first ruleset (extra value only applies to first ruleset)
      const firstRulesetId = config.rulesets[0]?.id;
      if (!firstRulesetId) return base;
      
      // Separate first ruleset drafts from others
      const firstRulesetDrafts = base.filter(d => d.rulesetId === firstRulesetId);
      const otherDrafts = base.filter(d => d.rulesetId !== firstRulesetId);
      
      if (firstRulesetDrafts.length === 0) return base;
      
      // Find the last month's drafts in first ruleset (where extra value applies)
      const lastMonth = Math.max(...firstRulesetDrafts.map(d => d.month));
      const lastMonthDrafts = firstRulesetDrafts.filter(d => d.month === lastMonth);
      const earlierDrafts = firstRulesetDrafts.filter(d => d.month < lastMonth);
      
      if (lastMonthDrafts.length === 0) return base;
      
      // Calculate total base value for last month
      const baseTotal = lastMonthDrafts.reduce((sum, d) => sum + d.amount, 0);
      const newTotal = baseTotal + extraValue;
      
      // Get template from first draft for creating new ones
      const template = lastMonthDrafts[0];
      const year = template.year;
      const month = template.month;
      const ruleset = config.rulesets.find(r => r.id === firstRulesetId)!;
      const maxValue = ruleset.maxInvoiceValue; // undefined means no splitting
      
      const newLastMonthDrafts: InvoiceDraft[] = [];
      
      // If no maxValue set, create a single invoice with the total
      if (!maxValue) {
        const { invoiceNo } = getMonthDates(year, month, 0);
        const periodLabel = getInvoiceLabel(year, month, ruleset);
        const label = `${periodLabel} (${ruleset.name})`;
        
        newLastMonthDrafts.push({
          id: `${firstRulesetId}-${year}-${month}-0`,
          rulesetId: firstRulesetId,
          year,
          month,
          index: 0,
          amount: Math.round(newTotal),
          description: template.description,
          invoiceNoOverride: invoiceNo,
          variableSymbolOverride: invoiceNo,
          status: 'pending',
          label,
          periodLabel,
          monthSalary: template.monthSalary,
          periodBaseSalary: template.periodBaseSalary,
          extraValue: extraValue > 0 ? extraValue : undefined
        });
      } else {
        // Determine how many full invoices and remainder
        const fullInvoiceCount = Math.floor(newTotal / maxValue);
        const remainder = newTotal % maxValue;
        const totalParts = fullInvoiceCount + (remainder > 0 ? 1 : 0);
        const remCount = totalParts - 1; // Number of invoices after the first one
        
        let extraRemaining = extraValue;
        let baseRemaining = baseTotal;
        
        // Create full invoices
        for (let i = 0; i < fullInvoiceCount; i++) {
          const amount = maxValue;
          
          // Calculate how much extra is in this invoice
          let draftExtra = 0;
          if (baseRemaining >= amount) {
            draftExtra = 0;
            baseRemaining -= amount;
          } else {
            draftExtra = amount - Math.max(0, baseRemaining);
            baseRemaining = 0;
            extraRemaining -= draftExtra;
          }
          
          const { invoiceNo } = getMonthDates(year, month, i);
          const periodLabel = getInvoiceLabel(year, month, ruleset);
          
          // This is the flush period, use "Remainder X/Y" labeling
          let label = `${periodLabel} (${ruleset.name})`;
          if (i > 0 && remCount > 0) {
            label += remCount === 1 ? " Remainder" : ` Remainder ${i}/${remCount}`;
          }
          
          newLastMonthDrafts.push({
            id: `${firstRulesetId}-${year}-${month}-${i}`,
            rulesetId: firstRulesetId,
            year,
            month,
            index: i,
            amount,
            description: template.description,
            invoiceNoOverride: invoiceNo,
            variableSymbolOverride: invoiceNo,
            status: 'pending',
            label,
            periodLabel,
            monthSalary: template.monthSalary,
            periodBaseSalary: template.periodBaseSalary,
            extraValue: draftExtra > 0 ? draftExtra : undefined
          });
        }
        
        // Create remainder invoice if any
        if (remainder > 0) {
          const partIndex = fullInvoiceCount;
          const { invoiceNo } = getMonthDates(year, month, partIndex);
          const periodLabel = getInvoiceLabel(year, month, ruleset);
          
          // This is the flush period, use "Remainder X/Y" labeling
          let label = `${periodLabel} (${ruleset.name})`;
          if (partIndex > 0 && remCount > 0) {
            label += remCount === 1 ? " Remainder" : ` Remainder ${partIndex}/${remCount}`;
          }
          
          // All remaining extra goes to remainder
          const draftExtra = extraRemaining > 0 ? Math.min(extraRemaining, remainder) : undefined;
          
          newLastMonthDrafts.push({
            id: `${firstRulesetId}-${year}-${month}-${partIndex}`,
            rulesetId: firstRulesetId,
            year,
            month,
            index: partIndex,
            amount: Math.round(remainder),
            description: template.description,
            invoiceNoOverride: invoiceNo,
            variableSymbolOverride: invoiceNo,
            status: 'pending',
            label,
            periodLabel,
            monthSalary: template.monthSalary,
            periodBaseSalary: template.periodBaseSalary,
            extraValue: draftExtra
          });
        }
      }
      
      return [...earlierDrafts, ...newLastMonthDrafts, ...otherDrafts];
    };
    
    // Calculate total extra including adhoc invoices
    const adhocTotal = adhocInvoices.reduce((sum, inv) => sum + inv.value, 0);
    const totalExtraValue = proplatitTotalValue + adhocTotal;
    
    // Apply extra value to base drafts
    const draftsWithExtra = applyExtraValueToDrafts(baseDrafts, totalExtraValue);
    
    // Merge with existing drafts, preserving user edits (non-amount fields) and status
    setDrafts(prevDrafts => {
      const existingMap = new Map(prevDrafts.map(d => [d.id, d]));
      
      return draftsWithExtra.map(newDraft => {
        const existing = existingMap.get(newDraft.id);
        const userEdits = userEditsRef.current.get(newDraft.id);
        
        if (existing) {
          return {
            ...newDraft,
            invoiceNoOverride: userEdits?.invoiceNoOverride ?? existing.invoiceNoOverride,
            variableSymbolOverride: userEdits?.variableSymbolOverride ?? existing.variableSymbolOverride,
            description: userEdits?.description ?? existing.description,
            status: existing.status
          };
        } else if (userEdits) {
          return {
            ...newDraft,
            invoiceNoOverride: userEdits.invoiceNoOverride ?? newDraft.invoiceNoOverride,
            variableSymbolOverride: userEdits.variableSymbolOverride ?? newDraft.variableSymbolOverride,
            description: userEdits.description ?? newDraft.description
          };
        }
        
        return newDraft;
      });
    });
  }, [baseDrafts, proplatitTotalValue, adhocInvoices, proplatitLoading, lastInvoicedMonthLoading, config.rulesets]);

  function isBillingMonth(month: number, ruleset: Ruleset): boolean {
    switch (ruleset.periodicity) {
      case 'monthly': return true;
      case 'quarterly': return month % 3 === 0;
      case 'yearly': return month === 12;
      case 'custom_months': return month % (ruleset.periodicityCustomValue || 1) === 0;
      case 'custom_days': return true;
      default: return true;
    }
  }

  function getInvoiceLabel(year: number, month: number, ruleset: Ruleset): string {
    const yearShort = year.toString().slice(-2);
    
    switch (ruleset.periodicity) {
      case 'monthly':
        return `${month}/${yearShort}`;
      case 'quarterly':
        const q = Math.ceil(month / 3);
        return `Q${q} ${yearShort}`;
      case 'yearly':
        return `${year}`;
      case 'custom_months':
        const n = ruleset.periodicityCustomValue || 1;
        const startM = month - n + 1;
        const startMStr = startM.toString().padStart(2, '0');
        const endMStr = month.toString().padStart(2, '0');
        return `${startMStr}-${endMStr}/${yearShort}`;
      default:
        return `${month}/${yearShort}`;
    }
  }

  // Helper to find customer for a draft based on ruleset rules
  const findCustomerForDraft = (draft: InvoiceDraft): CompanyDetails | undefined => {
    const ruleset = config.rulesets.find(r => r.id === draft.rulesetId);
    if (!ruleset) return undefined;
    
    for (const rule of ruleset.rules) {
      let match = false;
      if (rule.condition === 'odd') match = (draft.month % 2 !== 0);
      else if (rule.condition === 'even') match = (draft.month % 2 === 0);
      else if (rule.condition === 'default') match = true;
      
      if (match) {
        const customer = config.companies.find(c => c.id === rule.companyId);
        if (customer) return customer;
      }
    }
    return undefined;
  };

  const openGenerateAllModal = () => {
    // Freeze the invoices list for the whole modal session so parent re-renders (sync)
    // can't cause the modal to suddenly show "0 of 0".
    const regularDrafts = drafts
      .filter(d => d.status !== 'done')
      .map(d => {
        const customer = findCustomerForDraft(d);
        const ruleset = config.rulesets.find(r => r.id === d.rulesetId);
        const dueDateOffsetDays = ruleset?.dueDateOffsetDays ?? 14;
        
        // Calculate issue date and due date
        let day = 1;
        if (d.invoiceNoOverride.length === 8) {
          day = parseInt(d.invoiceNoOverride.substring(0, 2));
        }
        const issueDate = new Date(d.year, d.month - 1, day);
        const dueDate = new Date();
        dueDate.setDate(dueDate.getDate() + dueDateOffsetDays);
        
        return {
          id: d.id,
          label: d.label,
          amount: d.amount,
          customerId: customer?.id,
          invoiceNo: d.invoiceNoOverride,
          issueDate: `${issueDate.getDate()}. ${issueDate.getMonth() + 1}. ${issueDate.getFullYear()}`,
          dueDate: `${dueDate.getDate()}. ${dueDate.getMonth() + 1}. ${dueDate.getFullYear()}`,
          description: d.description,
        };
      });
    
    // Include adhoc invoices with a special prefix
    const adhocDrafts = adhocInvoices.map(inv => {
      const issueDate = new Date(inv.issueDate);
      const dueDate = new Date(inv.dueDate);
      return {
        id: `adhoc:${inv.id}`,
        label: inv.name,
        amount: inv.value,
        customerId: inv.customerId,
        invoiceNo: inv.invoiceNo,
        issueDate: `${issueDate.getDate()}. ${issueDate.getMonth() + 1}. ${issueDate.getFullYear()}`,
        dueDate: `${dueDate.getDate()}. ${dueDate.getMonth() + 1}. ${dueDate.getFullYear()}`,
        description: inv.description,
      };
    });
    
    setGenerateAllInvoicesSnapshot([...regularDrafts, ...adhocDrafts]);
    // Snapshot extra files with DESTINATION paths (files will be moved from proplatit to proplaceno)
    setGenerateAllExtraFilesSnapshot(
      selectedProplatitFiles.map(item => ({
        // Replace 'proplatit' with 'proplaceno' in the path since files get moved during generation
        path: item.file.path.replace(/proplatit([\\\/])/i, 'proplaceno$1'),
        name: item.file.name
      }))
    );
    setGenerateAllModalOpen(true);
  };

  const handleGenerate = async (draft: InvoiceDraft, isPreview: boolean = false) => {
    const ruleset = config.rulesets.find(r => r.id === draft.rulesetId);
    if (!ruleset) { alert("Ruleset not found"); return undefined; }

    const isLastDraft = drafts[drafts.length - 1].id === draft.id;
    const itemsToMove = (!isPreview && isLastDraft) ? selectedProplatitFiles : [];

    let day = "1";
    if (draft.invoiceNoOverride.length === 8) {
      day = parseInt(draft.invoiceNoOverride.substring(0, 2)).toString();
    }

    const issueDate = new Date(draft.year, draft.month - 1, parseInt(day));
    const issueDateStr = `${issueDate.getDate()}. ${issueDate.getMonth() + 1}. ${issueDate.getFullYear()}`;
    
    // Due date is calculated from current date + configurable offset (default 14 days)
    const dueDateOffsetDays = ruleset.dueDateOffsetDays ?? 14;
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + dueDateOffsetDays);
    const dueDateStr = `${dueDate.getDate()}. ${dueDate.getMonth() + 1}. ${dueDate.getFullYear()}`;

    let customer: CompanyDetails | undefined;
    for (const rule of ruleset.rules) {
      let match = false;
      if (rule.condition === 'odd') match = (draft.month % 2 !== 0);
      else if (rule.condition === 'even') match = (draft.month % 2 === 0);
      else if (rule.condition === 'default') match = true;
      
      if (match) {
        customer = config.companies.find(c => c.id === rule.companyId);
        if (customer) break;
      }
    }
    
    if (!customer) { alert(`No customer for ${draft.month}/${draft.year} in ruleset ${ruleset.name}`); return undefined; }
    
    const supplier = config.companies.find(c => c.isSupplier) || config.companies[0];
    const amountStr = draft.amount.toLocaleString('cs-CZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    const replacements: Record<string, string> = {
      '{{P_NO}}': draft.invoiceNoOverride,
      '{{P_ISSUED}}': issueDateStr,
      '{{P_DUZP}}': issueDateStr,
      '{{P_DUE}}': dueDateStr,
      '{{P_VS}}': draft.variableSymbolOverride,
      '{{P_ACC}}': supplier.bankAccount || '',
      '{{P_SUPPLIER}}': [
        supplier.name,
        supplier.street,
        `${supplier.zip}, ${supplier.city}`,
        supplier.country,
        `IČ: ${supplier.ic}`,
        supplier.dic ? `DIČ: ${supplier.dic}` : ''
      ].filter(Boolean).join('\n'),
      '{{P_SUP_NAME}}': supplier.name,
      '{{P_SUP_STREET}}': supplier.street,
      '{{P_SUP_ZIP}}': supplier.zip,
      '{{P_SUP_CITY}}': supplier.city,
      '{{P_SUP_COUNTRY}}': supplier.country,
      '{{P_SUP_IC}}': supplier.ic,
      '{{P_SUP_DIC}}': supplier.dic || '',
      '{{P_CUSTOMER}}': [
        customer.name,
        customer.street,
        `${customer.zip}, ${customer.city}`,
        customer.country,
        `IČ: ${customer.ic}`,
        customer.dic ? `DIČ: ${customer.dic}` : ''
      ].filter(Boolean).join('\n'),
      '{{P_CUST_NAME}}': customer.name,
      '{{P_CUST_STREET}}': customer.street,
      '{{P_CUST_ZIP}}': customer.zip,
      '{{P_CUST_CITY}}': customer.city,
      '{{P_CUST_COUNTRY}}': customer.country,
      '{{P_CUST_IC}}': customer.ic,
      '{{P_CUST_DIC}}': customer.dic || '',
      '{{P_DESC}}': draft.description,
      '{{P_VALUE}}': amountStr,
      '{{P_VAT}}': "0%"
    };

    const yearShort = draft.year.toString().slice(-2);
    const monthShort = draft.month.toString().padStart(2, '0');
    const slug = ruleset.id;
    
    let suffix = "";
    if (draft.index > 0) suffix = `_${draft.index + 1}`;
    
    const baseName = `faktura_${slug}_${yearShort}_${monthShort}${suffix}`;
    const odtName = `${baseName}.odt`;
    
    // Use the configured invoices folder structure
    const outputDir = isPreview 
      ? `${config.rootPath}\\.preview`
      : await ensureYearFolder(config.rootPath, draft.year, config.projectStructure);

    const outputPath = `${outputDir}\\${odtName}`;
    
    try {
      // ensureYearFolder already creates the directory, but mkdir is safe to call again
      const templatePath = ruleset.templatePath || 'src/templates/template.odt';
      await generateInvoiceOdt(templatePath, outputPath, replacements);
      await convertToPdf(outputPath, outputDir, loadGlobalSettings().sofficePath);
      
      if (!isPreview) {
        if (itemsToMove.length > 0) {
          for (const item of itemsToMove) {
            await moveProplatitFile(config.rootPath, item.file.name, config.projectStructure);
          }
        }
        // Clean up user edits for this draft
        userEditsRef.current.delete(draft.id);
        setDrafts(ds => ds.map(d => d.id === draft.id ? { ...d, status: 'done' } : d));
      }
      
      return outputPath.replace('.odt', '.pdf');
    } catch (e) {
      console.error(e);
      alert(`Error generating ${baseName}: ${e}`);
      return undefined;
    }
  };

  // Callback for the modal to generate a single invoice by ID
  const handleGenerateById = async (draftId: string): Promise<string | undefined> => {
    // Check if this is an adhoc invoice (prefixed with "adhoc:")
    if (draftId.startsWith('adhoc:')) {
      const adhocId = draftId.replace('adhoc:', '');
      const adhocInvoice = adhocInvoices.find(inv => inv.id === adhocId);
      if (!adhocInvoice) return undefined;
      return handleGenerateAdhocInvoice(adhocInvoice);
    }
    
    // Regular draft
    const draft = drafts.find(d => d.id === draftId);
    if (!draft || draft.status === 'done') return undefined;
    return handleGenerate(draft, false);
  };

  // Called when the Generate All modal completes - syncs UI with disk state
  const handleGenerateAllComplete = async () => {
    // Clear user edits since we're reloading everything
    userEditsRef.current.clear();
    // Clear adhoc invoices since they've been generated
    setAdhocInvoices([]);
    // Clear total overrides since they applied to the generated periods
    setTotalOverrides(new Map());
    // Reload both proplatit files and last invoiced month from disk
    // This will trigger drafts recalculation via useEffect
    await Promise.all([
      loadProplatitFiles(),
      reloadLastInvoicedMonth()
    ]);
  };

  const handlePreview = async (draft: InvoiceDraft) => {
    setPreviewModalOpen(true);
    setPreviewLoading(true);
    setPreviewPdfUrl(null);
    setPreviewStep('Preparing invoice template...');
    
    try {
      setPreviewStep('Generating ODT document...');
      await new Promise(r => setTimeout(r, 100));
      
      setPreviewStep('Converting to PDF...');
      const path = await handleGenerate(draft, true);
      
      if (path) {
        setPreviewStep('Loading preview...');
        const pdfData = await readFile(path);
        const blob = new Blob([pdfData], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        setPreviewPdfUrl(url);
      }
    } catch (e) {
      console.error('Preview failed:', e);
    } finally {
      setPreviewLoading(false);
      setPreviewStep('');
    }
  };
  
  const closePreviewModal = () => {
    if (previewPdfUrl) {
      URL.revokeObjectURL(previewPdfUrl);
    }
    setPreviewModalOpen(false);
    setPreviewPdfUrl(null);
    setPreviewLoading(false);
    setPreviewStep('');
  };

  // Adhoc invoice handlers
  const handleAddAdhocInvoice = (invoice: Omit<AdhocInvoice, 'id'>) => {
    const newInvoice: AdhocInvoice = {
      ...invoice,
      id: `adhoc-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    };
    setAdhocInvoices(prev => [...prev, newInvoice]);
    setAdhocModalOpen(false);
  };

  const handleRemoveAdhocInvoice = (id: string) => {
    setAdhocInvoices(prev => prev.filter(inv => inv.id !== id));
  };

  const handleUpdateAdhocInvoice = (id: string, updates: Omit<AdhocInvoice, 'id'>) => {
    setAdhocInvoices(prev => prev.map(inv => 
      inv.id === id ? { ...updates, id } : inv
    ));
    setAdhocModalOpen(false);
    setEditingAdhocInvoice(null);
  };

  const handlePreviewAdhocInvoice = async (invoice: AdhocInvoice) => {
    setPreviewModalOpen(true);
    setPreviewLoading(true);
    setPreviewPdfUrl(null);
    setPreviewStep('Preparing invoice template...');
    
    try {
      const supplier = config.companies.find(c => c.id === invoice.supplierId);
      const customer = config.companies.find(c => c.id === invoice.customerId);
      
      if (!supplier || !customer) {
        toast.error('Supplier or customer not found');
        return;
      }

      const issueDate = new Date(invoice.issueDate);
      const issueDateStr = `${issueDate.getDate()}. ${issueDate.getMonth() + 1}. ${issueDate.getFullYear()}`;
      
      const dueDate = new Date(invoice.dueDate);
      const dueDateStr = `${dueDate.getDate()}. ${dueDate.getMonth() + 1}. ${dueDate.getFullYear()}`;

      const amountStr = invoice.value.toLocaleString('cs-CZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

      const replacements: Record<string, string> = {
        '{{P_NO}}': invoice.invoiceNo,
        '{{P_ISSUED}}': issueDateStr,
        '{{P_DUZP}}': issueDateStr,
        '{{P_DUE}}': dueDateStr,
        '{{P_VS}}': invoice.variableSymbol,
        '{{P_ACC}}': supplier.bankAccount || '',
        '{{P_SUPPLIER}}': [
          supplier.name,
          supplier.street,
          `${supplier.zip}, ${supplier.city}`,
          supplier.country,
          `IČ: ${supplier.ic}`,
          supplier.dic ? `DIČ: ${supplier.dic}` : ''
        ].filter(Boolean).join('\n'),
        '{{P_SUP_NAME}}': supplier.name,
        '{{P_SUP_STREET}}': supplier.street,
        '{{P_SUP_ZIP}}': supplier.zip,
        '{{P_SUP_CITY}}': supplier.city,
        '{{P_SUP_COUNTRY}}': supplier.country,
        '{{P_SUP_IC}}': supplier.ic,
        '{{P_SUP_DIC}}': supplier.dic || '',
        '{{P_CUSTOMER}}': [
          customer.name,
          customer.street,
          `${customer.zip}, ${customer.city}`,
          customer.country,
          `IČ: ${customer.ic}`,
          customer.dic ? `DIČ: ${customer.dic}` : ''
        ].filter(Boolean).join('\n'),
        '{{P_CUST_NAME}}': customer.name,
        '{{P_CUST_STREET}}': customer.street,
        '{{P_CUST_ZIP}}': customer.zip,
        '{{P_CUST_CITY}}': customer.city,
        '{{P_CUST_COUNTRY}}': customer.country,
        '{{P_CUST_IC}}': customer.ic,
        '{{P_CUST_DIC}}': customer.dic || '',
        '{{P_DESC}}': invoice.description,
        '{{P_VALUE}}': amountStr,
        '{{P_VAT}}': "0%"
      };

      setPreviewStep('Generating ODT document...');
      await new Promise(r => setTimeout(r, 100));

      const outputDir = `${config.rootPath}\\.preview`;
      const baseName = `adhoc_${invoice.invoiceNo}`;
      const outputPath = `${outputDir}\\${baseName}.odt`;

      await mkdir(outputDir, { recursive: true });
      
      // Use first ruleset's template or default
      const templatePath = config.rulesets[0]?.templatePath || 'src/templates/template.odt';
      
      setPreviewStep('Converting to PDF...');
      await generateInvoiceOdt(templatePath, outputPath, replacements);
      await convertToPdf(outputPath, outputDir, loadGlobalSettings().sofficePath);
      
      const pdfPath = outputPath.replace('.odt', '.pdf');
      setPreviewStep('Loading preview...');
      const pdfData = await readFile(pdfPath);
      const blob = new Blob([pdfData], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      setPreviewPdfUrl(url);
    } catch (e) {
      console.error('Preview failed:', e);
      toast.error(`Preview failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setPreviewLoading(false);
      setPreviewStep('');
    }
  };

  // Generate adhoc invoice (actual generation, not preview)
  const handleGenerateAdhocInvoice = async (invoice: AdhocInvoice): Promise<string | undefined> => {
    try {
      const supplier = config.companies.find(c => c.id === invoice.supplierId);
      const customer = config.companies.find(c => c.id === invoice.customerId);
      
      if (!supplier || !customer) {
        toast.error('Supplier or customer not found');
        return undefined;
      }

      const issueDate = new Date(invoice.issueDate);
      const issueDateStr = `${issueDate.getDate()}. ${issueDate.getMonth() + 1}. ${issueDate.getFullYear()}`;
      
      const dueDate = new Date(invoice.dueDate);
      const dueDateStr = `${dueDate.getDate()}. ${dueDate.getMonth() + 1}. ${dueDate.getFullYear()}`;

      const amountStr = invoice.value.toLocaleString('cs-CZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

      const replacements: Record<string, string> = {
        '{{P_NO}}': invoice.invoiceNo,
        '{{P_ISSUED}}': issueDateStr,
        '{{P_DUZP}}': issueDateStr,
        '{{P_DUE}}': dueDateStr,
        '{{P_VS}}': invoice.variableSymbol,
        '{{P_ACC}}': supplier.bankAccount || '',
        '{{P_SUPPLIER}}': [
          supplier.name,
          supplier.street,
          `${supplier.zip}, ${supplier.city}`,
          supplier.country,
          `IČ: ${supplier.ic}`,
          supplier.dic ? `DIČ: ${supplier.dic}` : ''
        ].filter(Boolean).join('\n'),
        '{{P_SUP_NAME}}': supplier.name,
        '{{P_SUP_STREET}}': supplier.street,
        '{{P_SUP_ZIP}}': supplier.zip,
        '{{P_SUP_CITY}}': supplier.city,
        '{{P_SUP_COUNTRY}}': supplier.country,
        '{{P_SUP_IC}}': supplier.ic,
        '{{P_SUP_DIC}}': supplier.dic || '',
        '{{P_CUSTOMER}}': [
          customer.name,
          customer.street,
          `${customer.zip}, ${customer.city}`,
          customer.country,
          `IČ: ${customer.ic}`,
          customer.dic ? `DIČ: ${customer.dic}` : ''
        ].filter(Boolean).join('\n'),
        '{{P_CUST_NAME}}': customer.name,
        '{{P_CUST_STREET}}': customer.street,
        '{{P_CUST_ZIP}}': customer.zip,
        '{{P_CUST_CITY}}': customer.city,
        '{{P_CUST_COUNTRY}}': customer.country,
        '{{P_CUST_IC}}': customer.ic,
        '{{P_CUST_DIC}}': customer.dic || '',
        '{{P_DESC}}': invoice.description,
        '{{P_VALUE}}': amountStr,
        '{{P_VAT}}': "0%"
      };

      const year = issueDate.getFullYear();
      
      // Use the configured invoices folder structure
      const outputDir = await ensureYearFolder(config.rootPath, year, config.projectStructure);
      
      // Normalize the name for filename: remove diacritics, lowercase, replace spaces with underscores
      const normalizedName = invoice.name
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // Remove diacritics
        .toLowerCase()
        .replace(/\s+/g, '_') // Replace spaces with underscores
        .replace(/[^a-z0-9_]/g, ''); // Remove any other special characters
      
      const baseName = `faktura_adhoc_${normalizedName}_${invoice.invoiceNo}`;
      const outputPath = `${outputDir}\\${baseName}.odt`;

      // ensureYearFolder already creates the directory
      
      // Use first ruleset's template or default
      const templatePath = config.rulesets[0]?.templatePath || 'src/templates/template.odt';
      
      await generateInvoiceOdt(templatePath, outputPath, replacements);
      await convertToPdf(outputPath, outputDir, loadGlobalSettings().sofficePath);
      
      return outputPath.replace('.odt', '.pdf');
    } catch (e) {
      console.error('Generation failed:', e);
      toast.error(`Generation failed: ${e instanceof Error ? e.message : String(e)}`);
      return undefined;
    }
  };

  const totalDraftValue = drafts.reduce((sum, d) => sum + d.amount, 0);
  const adhocTotalValue = adhocInvoices.reduce((sum, inv) => sum + inv.value, 0);

  // Helper to check if there are any invoices ready for generation
  const hasActiveInvoices = drafts.length > 0 || adhocInvoices.length > 0;

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8">
      {showPageLoading ? (
        <div className="p-8 flex items-center justify-center min-h-[400px]">
          <div className="flex flex-col items-center gap-4">
            <Loader2 size={32} className="animate-spin" style={{ color: 'var(--accent-500)' }} />
            <p style={{ color: 'var(--text-muted)' }} className="text-sm font-medium">Loading invoices...</p>
          </div>
        </div>
      ) : (
      <>
        {/* Page Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <button
              onClick={handleRefresh}
              disabled={refreshing || loading}
              className="btn btn-ghost btn-icon"
              style={{ color: 'var(--text-muted)' }}
              title="Refresh invoices"
            >
              <RefreshCw size={20} className={refreshing ? 'animate-spin' : ''} />
            </button>
            <h2 
              className="text-2xl lg:text-3xl font-bold"
              style={{ color: 'var(--text-primary)' }}
            >
              Pending Invoices
            </h2>
          </div>
          <p 
            className="text-sm"
            style={{ color: 'var(--text-muted)' }}
          >
            {hasActiveInvoices 
              ? `${drafts.length + adhocInvoices.length} invoice${drafts.length + adhocInvoices.length !== 1 ? 's' : ''} ready for generation`
              : 'No pending invoices at this time'
            }
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Add Adhoc Invoice Button */}
          <button
            onClick={() => {
              setEditingAdhocInvoice(null);
              setAdhocModalOpen(true);
            }}
            className="btn btn-ghost btn-icon"
            style={{ color: 'var(--text-muted)' }}
            title="Add custom invoice"
          >
            <Plus size={20} />
          </button>

          {drafts.length > 0 && (
            <>
              {/* Total Summary */}
              <div 
                className="card px-4 py-3 flex items-center gap-3"
                style={{ backgroundColor: 'var(--accent-50)' }}
              >
                <div 
                  className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: 'var(--accent-100)' }}
                >
                  <Banknote size={20} style={{ color: 'var(--accent-600)' }} />
                </div>
                <div>
                  <p className="text-xs font-medium" style={{ color: 'var(--accent-600)' }}>Total Value</p>
                  <p className="text-lg font-bold font-mono" style={{ color: 'var(--accent-700)' }}>
                    <NumberFlow 
                      value={totalDraftValue} 
                      format={{ useGrouping: true }}
                      suffix={` ${config.primaryCurrency}`}
                    />
                  </p>
                </div>
              </div>
            </>
          )}

          {/* Generate All Button - show when there are any invoices (regular or adhoc) */}
          {hasActiveInvoices && (
            <CauldronButton onClick={openGenerateAllModal}>
              <Sparkles size={18} className="flex-shrink-0" />
              <span>Generate All</span>
            </CauldronButton>
          )}
        </div>
      </div>

      {/* Billing Period Badge */}
      {drafts.length > 0 && (
        <div 
          className="card mb-6 px-5 py-4 flex items-center gap-3"
          style={{ borderLeft: '4px solid var(--accent-500)' }}
        >
          <div 
            className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: 'var(--accent-100)' }}
          >
            <Calendar size={16} style={{ color: 'var(--accent-600)' }} />
          </div>
          <div>
            <span className="text-sm font-medium" style={{ color: 'var(--text-muted)' }}>
              Billing Periods:
            </span>
            <span className="ml-2 font-semibold" style={{ color: 'var(--text-primary)' }}>
              {Array.from(new Set(drafts.map(d => d.periodLabel))).join(', ')}
            </span>
          </div>
        </div>
      )}

      {/* Extra Items Section - Accordion */}
      {proplatitFiles.length > 0 && (
        <div className="card mb-8 overflow-hidden">
          {/* Accordion Header */}
          <div 
            className="px-5 py-4 flex items-center justify-between"
            style={{ 
              backgroundColor: 'var(--bg-muted)',
              borderBottom: extraItemsExpanded ? '1px solid var(--border-default)' : 'none'
            }}
          >
            <button
              onClick={() => setExtraItemsExpanded(!extraItemsExpanded)}
              className="flex items-center gap-3 cursor-pointer hover:opacity-80 transition-opacity"
            >
              <div 
                className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: 'var(--accent-100)' }}
              >
                <Package size={16} style={{ color: 'var(--accent-600)' }} />
              </div>
              <h3 className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                Extra Items
              </h3>
              <span className="badge badge-primary">
                {proplatitFiles.length}
              </span>
            </button>
            <div className="flex items-center gap-4">
              {/* Analyze Button */}
              {canAnalyze && proplatitFiles.length > 0 && (
                <button
                  onClick={handleAnalyzeExtraItems}
                  disabled={analyzing}
                  className="btn btn-secondary btn-sm flex items-center gap-2"
                  title="Analyze items with AI to extract amounts"
                >
                  {analyzing ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      <span>
                        {analysisProgress 
                          ? `${analysisProgress.completed}/${analysisProgress.total}`
                          : 'Analyzing...'
                        }
                      </span>
                    </>
                  ) : (
                    <>
                      <Wand2 size={14} />
                      <span>Analyze</span>
                    </>
                  )}
                </button>
              )}
              <div 
                className="text-lg font-bold font-mono"
                style={{ color: 'var(--accent-600)' }}
              >
                <NumberFlow 
                  value={proplatitTotalValue} 
                  format={{ useGrouping: true }}
                  suffix={` ${config.primaryCurrency}`}
                />
              </div>
              <button
                onClick={() => setExtraItemsExpanded(!extraItemsExpanded)}
                className="p-1 hover:opacity-80 transition-opacity"
              >
                <ChevronDown 
                  size={20} 
                  style={{ 
                    color: 'var(--text-muted)',
                    transform: extraItemsExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                    transition: 'transform 0.2s ease'
                  }} 
                />
              </button>
            </div>
          </div>

          {/* Accordion Content */}
          <div 
            style={{ 
              maxHeight: extraItemsExpanded ? '1000px' : '0',
              opacity: extraItemsExpanded ? 1 : 0,
              overflow: 'hidden',
              transition: 'max-height 0.3s ease, opacity 0.2s ease'
            }}
          >
            <ExtraItemsList
              items={proplatitFiles}
              primaryCurrency={config.primaryCurrency}
              onUpdateItem={updateProplatitItem}
              analyzingIndices={analyzingIndices}
            />
          </div>
        </div>
      )}

      {/* Adhoc Invoices Section */}
      {adhocInvoices.length > 0 && (
        <div className="card mb-8 overflow-hidden">
          <div 
            className="px-5 py-4 flex items-center justify-between"
            style={{ 
              backgroundColor: 'var(--bg-muted)',
              borderBottom: '1px solid var(--border-default)'
            }}
          >
            <div className="flex items-center gap-3">
              <div 
                className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: 'var(--accent-100)' }}
              >
                <Plus size={16} style={{ color: 'var(--accent-600)' }} />
              </div>
              <h3 className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                Adhoc Invoices
              </h3>
              <span className="badge badge-primary">
                {adhocInvoices.length}
              </span>
            </div>
            <div 
              className="text-lg font-bold font-mono"
              style={{ color: 'var(--accent-600)' }}
            >
              <NumberFlow 
                value={adhocTotalValue} 
                format={{ useGrouping: true }}
                suffix={` ${config.primaryCurrency}`}
              />
            </div>
          </div>
          
          <div className="divide-y" style={{ borderColor: 'var(--border-default)' }}>
            {adhocInvoices.map(invoice => (
              <div key={invoice.id} className="px-5 py-4 flex items-center justify-between">
                <div className="flex-1">
                  <button
                    onClick={() => handlePreviewAdhocInvoice(invoice)}
                    className="group flex items-center gap-3 mb-1 cursor-pointer"
                  >
                    <span 
                      className="font-semibold group-hover:underline" 
                      style={{ color: 'var(--accent-600)' }}
                    >
                      {invoice.name}
                    </span>
                    <span className="text-sm font-mono" style={{ color: 'var(--text-muted)' }}>
                      #{invoice.invoiceNo}
                    </span>
                    <Eye 
                      size={14} 
                      className="opacity-0 group-hover:opacity-100 transition-opacity" 
                      style={{ color: 'var(--text-muted)' }}
                    />
                  </button>
                  <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                    {invoice.description}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-bold font-mono" style={{ color: 'var(--text-primary)' }}>
                    {invoice.value.toLocaleString()} {config.primaryCurrency}
                  </span>
                  <button
                    onClick={() => {
                      setEditingAdhocInvoice(invoice);
                      setAdhocModalOpen(true);
                    }}
                    className="p-2 rounded-lg transition-colors hover:bg-black/5 dark:hover:bg-white/10"
                    style={{ color: 'var(--text-muted)' }}
                    title="Edit invoice"
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    onClick={() => handleRemoveAdhocInvoice(invoice.id)}
                    className="p-2 rounded-lg transition-colors hover:bg-red-500/10"
                    style={{ color: 'var(--error-500)' }}
                    title="Remove invoice"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

        {/* Invoice Drafts */}
        <div className="space-y-4">
          {!hasActiveInvoices && (
            <div className="card p-12 flex flex-col items-center justify-center text-center">
              <div
                className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
                style={{ backgroundColor: 'var(--bg-muted)' }}
              >
                <FileText size={32} style={{ color: 'var(--text-muted)' }} />
              </div>
              <p className="text-lg font-medium" style={{ color: 'var(--text-secondary)' }}>
                No pending invoices
              </p>
              <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
                All invoices have been generated or it's too early in the billing period.
              </p>
            </div>
          )}

        {drafts.map((draft, i) => (
          <div 
            key={draft.id} 
            className={`card overflow-hidden card-hover relative ${draft.status === 'done' ? 'draft-done' : 'draft-pending'}`}
          >
            {/* Generated Overlay */}
            {draft.status === 'done' && (
              <div className="absolute inset-0 flex items-center justify-center z-10 draft-done-overlay">
                <div className="flex items-center gap-2 px-6 py-3 rounded-full draft-done-badge">
                  <CheckCircle2 size={20} />
                  <span className="font-bold">Generated</span>
                </div>
              </div>
            )}

            <div className="p-5">
              {/* Header Row */}
              <div className="flex items-start justify-between mb-4">
                <div>
                  <button
                    onClick={() => handlePreview(draft)}
                    className="group flex items-center gap-2 text-xl font-bold transition-colors cursor-pointer"
                    style={{ color: 'var(--accent-600)' }}
                  >
                    <FileSignature size={22} />
                    <span className="group-hover:underline">{draft.label}</span>
                    <Eye 
                      size={16} 
                      className="opacity-0 group-hover:opacity-100 transition-opacity" 
                    />
                  </button>
                  <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
                    Click to preview invoice
                  </p>
                </div>

                <div className="text-right">
                  {editingAmountId === draft.id ? (
                    <div className="flex items-center gap-2 justify-end">
                      <input
                        type="number"
                        autoFocus
                        defaultValue={(() => {
                          const periodKey = `${draft.rulesetId}-${draft.year}-${draft.month}`;
                          const override = totalOverrides.get(periodKey);
                          // If there's an existing override, use it; otherwise use base salary
                          return override !== undefined ? override : draft.periodBaseSalary;
                        })()}
                        className="w-32 text-right font-mono text-lg"
                        onBlur={(e) => {
                          const newTotal = Number(e.target.value);
                          if (!isNaN(newTotal) && newTotal >= 0) {
                            const periodKey = `${draft.rulesetId}-${draft.year}-${draft.month}`;
                            // If value equals base salary, remove override; otherwise set it
                            if (newTotal === draft.periodBaseSalary) {
                              setTotalOverrides(prev => {
                                const next = new Map(prev);
                                next.delete(periodKey);
                                return next;
                              });
                            } else {
                              setTotalOverrides(prev => new Map(prev).set(periodKey, newTotal));
                            }
                          }
                          setEditingAmountId(null);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            (e.target as HTMLInputElement).blur();
                          } else if (e.key === 'Escape') {
                            setEditingAmountId(null);
                          }
                        }}
                      />
                      <span className="text-lg font-bold" style={{ color: 'var(--text-muted)' }}>
                        {config.primaryCurrency}
                      </span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 justify-end">
                      <div 
                        className="text-2xl font-bold font-mono"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        {draft.amount.toLocaleString()} {config.primaryCurrency}
                      </div>
                      {draft.index === 0 && (
                        <button
                          onClick={() => setEditingAmountId(draft.id)}
                          className="p-1.5 rounded-lg transition-colors hover:bg-black/5 dark:hover:bg-white/10"
                          style={{ color: 'var(--text-muted)' }}
                          title="Edit total amount"
                        >
                          <Pencil size={16} />
                        </button>
                      )}
                      {(() => {
                        const periodKey = `${draft.rulesetId}-${draft.year}-${draft.month}`;
                        const overrideValue = totalOverrides.get(periodKey);
                        const baseValue = computedBaseTotalsRef.current.get(periodKey);
                        // Only show reset button if override is different from calculated
                        const hasEffectiveOverride = overrideValue !== undefined && overrideValue !== baseValue;
                        return hasEffectiveOverride && draft.index === 0 && (
                          <button
                            onClick={() => {
                              // Remove override - baseDrafts will recalculate to original
                              setTotalOverrides(prev => {
                                const next = new Map(prev);
                                next.delete(periodKey);
                                return next;
                              });
                            }}
                            className="p-1 rounded-lg transition-colors hover:bg-red-500/10"
                            style={{ color: 'var(--error-500)' }}
                            title="Reset to calculated amount"
                          >
                            <X size={14} />
                          </button>
                        );
                      })()}
                    </div>
                  )}
                  
                  {(() => {
                    const draftRuleset = config.rulesets.find(r => r.id === draft.rulesetId);
                    const maxVal = draftRuleset?.maxInvoiceValue;
                    const periodKey = `${draft.rulesetId}-${draft.year}-${draft.month}`;
                    const overrideValue = totalOverrides.get(periodKey);
                    const baseValue = computedBaseTotalsRef.current.get(periodKey);
                    // Only consider it a custom value if override is different from calculated
                    const hasEffectiveOverride = overrideValue !== undefined && overrideValue !== baseValue;
                    const isSplit = maxVal && draft.monthSalary > maxVal;
                    const isRemainder = draft.index > 0;
                    
                    // For remainder invoices, show consistent subline across all remainder parts
                    if (isRemainder) {
                      // Find all remainder drafts for this period
                      const periodRemainders = drafts.filter(d => 
                        d.rulesetId === draft.rulesetId && 
                        d.year === draft.year && 
                        d.month === draft.month && 
                        d.index > 0
                      );
                      
                      // If only 1 remainder part, omit subline entirely
                      if (periodRemainders.length <= 1) {
                        return null;
                      }
                      
                      // Calculate totals across all remainder parts
                      const totalRemainder = periodRemainders.reduce((sum, d) => sum + d.amount, 0);
                      const totalExtra = periodRemainders.reduce((sum, d) => sum + (d.extraValue || 0), 0);
                      const baseRemainder = totalRemainder - totalExtra;
                      
                      // Show: / TOTAL_REMAINDER CZK (BASE_REMAINDER CZK + EXTRA CZK)
                      // Omit "+ EXTRA CZK" if extra = 0
                      if (totalExtra > 0) {
                        return (
                          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                            / {totalRemainder.toLocaleString()} {config.primaryCurrency} ({baseRemainder.toLocaleString()} {config.primaryCurrency} + {totalExtra.toLocaleString()} {config.primaryCurrency})
                          </p>
                        );
                      } else {
                        return (
                          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                            / {totalRemainder.toLocaleString()} {config.primaryCurrency}
                          </p>
                        );
                      }
                    }
                    
                    // Extra value on first invoice - show invoice breakdown
                    if (draft.extraValue) {
                      const baseAmount = draft.amount - draft.extraValue;
                      return (
                        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                          {baseAmount > 0 ? `${baseAmount.toLocaleString()} + ` : ''}{draft.extraValue.toLocaleString()} {config.primaryCurrency} extra
                        </p>
                      );
                    }
                    
                    // Custom value with split (first invoice only)
                    if (hasEffectiveOverride && isSplit) {
                      return (
                        <p className="text-sm">
                          <span style={{ color: 'var(--text-muted)' }}>/ </span>
                          <span style={{ color: 'var(--accent-500)' }}>
                            {overrideValue!.toLocaleString()} {config.primaryCurrency} (split, custom)
                          </span>
                        </p>
                      );
                    }
                    
                    // Custom value without split (first invoice only)
                    if (hasEffectiveOverride) {
                      return (
                        <p className="text-sm" style={{ color: 'var(--accent-500)' }}>
                          (custom)
                        </p>
                      );
                    }
                    
                    // Normal split (first invoice only)
                    if (isSplit && draft.amount === maxVal) {
                      return (
                        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                          / {draft.periodBaseSalary.toLocaleString()} {config.primaryCurrency} (split)
                        </p>
                      );
                    }
                    
                    return null;
                  })()}
                </div>
              </div>

              {/* Form Fields */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div>
                  <label 
                    className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide mb-2"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    <Hash size={14} />
                    Number / VS
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={draft.invoiceNoOverride}
                      onChange={e => {
                        const newValue = e.target.value;
                        // Track user edit
                        const edits = userEditsRef.current.get(draft.id) || {};
                        edits.invoiceNoOverride = newValue;
                        if (draft.variableSymbolOverride === draft.invoiceNoOverride) {
                          edits.variableSymbolOverride = newValue;
                        }
                        userEditsRef.current.set(draft.id, edits);
                        
                        setDrafts(ds => ds.map((d, idx) => {
                          if (idx !== i) return d;
                          return {
                            ...d,
                            invoiceNoOverride: newValue,
                            variableSymbolOverride: d.variableSymbolOverride === draft.invoiceNoOverride 
                              ? newValue 
                              : d.variableSymbolOverride
                          };
                        }));
                      }}
                      className="flex-1 font-mono"
                    />
                    <input
                      type="text"
                      value={draft.variableSymbolOverride}
                      onChange={e => {
                        const newValue = e.target.value;
                        // Track user edit
                        const edits = userEditsRef.current.get(draft.id) || {};
                        edits.variableSymbolOverride = newValue;
                        userEditsRef.current.set(draft.id, edits);
                        
                        setDrafts(ds => ds.map((d, idx) => 
                          idx === i ? { ...d, variableSymbolOverride: newValue } : d
                        ));
                      }}
                      className="flex-1 font-mono"
                    />
                  </div>
                </div>

                <div>
                  <label 
                    className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide mb-2"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    <FileText size={14} />
                    Description
                  </label>
                  <CreatableSelect
                    value={(() => {
                      const options = (config.rulesets.find(r => r.id === draft.rulesetId)?.descriptions || []).map(d => ({ value: d, label: d }));
                      const found = findOption(options, draft.description);
                      if (found) return found;
                      return draft.description ? { value: draft.description, label: draft.description } : null;
                    })()}
                    onChange={(opt) => {
                      // Handle clear (opt is null) or selection/creation
                      const newValue = opt ? opt.value : '';
                      
                      // Track user edit
                      const edits = userEditsRef.current.get(draft.id) || {};
                      edits.description = newValue;
                      userEditsRef.current.set(draft.id, edits);
                      
                      setDrafts(ds => ds.map((d, idx) => 
                        idx === i ? { ...d, description: newValue } : d
                      ));
                    }}
                    options={(config.rulesets.find(r => r.id === draft.rulesetId)?.descriptions || []).map(d => ({ value: d, label: d }))}
                    isClearable
                    placeholder="Select or type..."
                    formatCreateLabel={(inputValue) => `Use "${inputValue}"`}
                  />
                </div>
              </div>
            </div>
          </div>
        ))}
        </div>
      </>
      )}

      <PDFPreviewModal
        isOpen={previewModalOpen}
        onClose={closePreviewModal}
        pdfUrl={previewPdfUrl}
        isLoading={previewLoading}
        progressStep={previewStep}
      />

      <GenerateAllModal
        isOpen={generateAllModalOpen}
        onClose={() => {
          setGenerateAllModalOpen(false);
          setGenerateAllInvoicesSnapshot([]);
          setGenerateAllExtraFilesSnapshot([]);
        }}
        invoices={generateAllInvoicesSnapshot}
        primaryCurrency={config.primaryCurrency}
        onGenerateInvoice={handleGenerateById}
        rootPath={config.rootPath}
        onComplete={handleGenerateAllComplete}
        config={config}
        extraFiles={generateAllExtraFilesSnapshot}
      />

      {/* Adhoc Invoice Modal - spawned dynamically */}
      {adhocModalOpen && (
        <AdhocInvoiceModal
          companies={config.companies}
          primaryCurrency={config.primaryCurrency}
          onClose={() => {
            setAdhocModalOpen(false);
            setEditingAdhocInvoice(null);
          }}
          onSubmit={editingAdhocInvoice 
            ? (invoice) => handleUpdateAdhocInvoice(editingAdhocInvoice.id, invoice)
            : handleAddAdhocInvoice
          }
          editingInvoice={editingAdhocInvoice}
        />
      )}
    </div>
  );
});

// Adhoc Invoice Modal Component
interface AdhocInvoiceModalProps {
  companies: CompanyDetails[];
  primaryCurrency: string;
  onClose: () => void;
  onSubmit: (invoice: Omit<AdhocInvoice, 'id'>) => void;
  editingInvoice?: AdhocInvoice | null;
}

function AdhocInvoiceModal({ companies, primaryCurrency, onClose, onSubmit, editingInvoice }: AdhocInvoiceModalProps) {
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
  }, [suppliers, customers, isEditMode]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const numValue = parseFloat(value);
    if (!name || !invoiceNo || !supplierId || !customerId || isNaN(numValue) || numValue <= 0) {
      toast.error('Please fill in all required fields');
      return;
    }

    onSubmit({
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
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

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
      onClick={(e) => e.target === e.currentTarget && onClose()}
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
            onClick={onClose}
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
              onClick={onClose}
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
}

export default Generator;
