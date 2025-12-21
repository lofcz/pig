import { useState, useEffect } from 'react';
import { Config, CompanyDetails, Ruleset } from '../types';
import { mkdir, readFile } from '@tauri-apps/plugin-fs';
import { moveProplatitFile, getMonthDates, getLastInvoicedMonth } from '../utils/logic';
import { generateInvoiceOdt, convertToPdf } from '../utils/odt';
import PDFPreviewModal from './PDFPreviewModal';
import GenerateAllModal from './GenerateAllModal';
import ExtraItemsList from './ExtraItemsList';
import { CauldronButton } from './CauldronButton';
import { useProplatitFiles } from '../hooks';
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
  Package
} from 'lucide-react';

interface GeneratorProps {
  config: Config;
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
  extraValue?: number;
}

export default function Generator({ config }: GeneratorProps) {
  const [currentDate] = useState(new Date());
  const [drafts, setDrafts] = useState<InvoiceDraft[]>([]);
  const [lastInvoicedMonth, setLastInvoicedMonth] = useState(0);
  const [lastInvoicedMonthLoading, setLastInvoicedMonthLoading] = useState(true);
  const [extraItemsExpanded, setExtraItemsExpanded] = useState(true);
  
  const [previewModalOpen, setPreviewModalOpen] = useState(false);
  const [previewPdfUrl, setPreviewPdfUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewStep, setPreviewStep] = useState<string>('');
  
  const [generateAllModalOpen, setGenerateAllModalOpen] = useState(false);
  const [generateAllInvoicesSnapshot, setGenerateAllInvoicesSnapshot] = useState<Array<{ id: string; label: string; amount: number }>>([]);

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
    exchangeRates: config.exchangeRates
  });

  const loading = proplatitLoading || lastInvoicedMonthLoading;
  const showPageLoading = loading && !generateAllModalOpen && !previewModalOpen;

  // Reusable function to reload the last invoiced month from disk
  const reloadLastInvoicedMonth = async () => {
    setLastInvoicedMonthLoading(true);
    const yStr = currentDate.getFullYear().toString().slice(-2);
    const lastM = await getLastInvoicedMonth(config.rootPath, yStr);
    setLastInvoicedMonth(lastM);
    setLastInvoicedMonthLoading(false);
  };

  // Load on mount and when config changes
  useEffect(() => {
    reloadLastInvoicedMonth();
  }, [config.rootPath, currentDate]);

  useEffect(() => {
    if (loading) return;
    
    const newDrafts: InvoiceDraft[] = [];
    const year = currentDate.getFullYear();
    const currentMonth = currentDate.getMonth() + 1;

    for (const ruleset of config.rulesets) {
      const cutoffDay = ruleset.entitlementDay;
      const endMonth = currentDate.getDate() > cutoffDay ? currentMonth - 1 : currentMonth - 2;
      let startMonth = lastInvoicedMonth + 1;
      
      if (startMonth > endMonth) continue;

      let accumulatedValue = 0;
      let accumulatedExtra = 0;

      for (let m = startMonth; m <= endMonth; m++) {
        const dateStr = `${year}-${m.toString().padStart(2, '0')}`;
        const salaryRule = ruleset.salaryRules.find(r => dateStr >= r.startDate && dateStr <= r.endDate) 
          || { value: 0, deduction: 0 };
        
        let monthValue = salaryRule.value - salaryRule.deduction;
        
        let extraAddedThisMonth = 0;
        if (m === endMonth && config.rulesets[0].id === ruleset.id) {
          extraAddedThisMonth = proplatitTotalValue;
          monthValue += extraAddedThisMonth;
        }
        
        accumulatedValue += monthValue;
        accumulatedExtra += extraAddedThisMonth;

        if (!isBillingMonth(m, ruleset)) {
          continue;
        }
        
        const isFlush = ruleset.minimizeInvoices && (m === endMonth);
        const totalParts = isFlush ? Math.ceil(accumulatedValue / config.maxInvoiceValue) : 0;
        
        let partIndex = 0;
        
        while (accumulatedValue >= config.maxInvoiceValue) {
          const amount = config.maxInvoiceValue;
          let currentBase = accumulatedValue - accumulatedExtra;
          let draftExtra = 0;
          
          if (currentBase >= amount) {
            draftExtra = 0;
          } else {
            draftExtra = amount - Math.max(0, currentBase);
          }
          
          accumulatedValue -= amount;
          accumulatedExtra -= draftExtra;
          
          const { invoiceNo } = getMonthDates(year, m, partIndex);
          const desc = ruleset.descriptions && ruleset.descriptions.length > 0 
            ? ruleset.descriptions[Math.floor(Math.random() * ruleset.descriptions.length)]
            : "Služby";

          const periodLabel = getInvoiceLabel(year, m, ruleset);
          let label = `${periodLabel} (${ruleset.name})`;
          
          if (isFlush) {
            if (totalParts > 1 && partIndex > 0) {
              const remCount = totalParts - 1;
              label += remCount === 1 ? " Remainder" : ` Remainder ${partIndex}/${remCount}`;
            }
          } else if (m === endMonth && partIndex > 0) {
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
            monthSalary: salaryRule.value - salaryRule.deduction,
            extraValue: draftExtra > 0 ? draftExtra : undefined
          });
          partIndex++;
        }
        
        if (accumulatedValue > 0) {
          if (ruleset.minimizeInvoices && m !== endMonth) {
            // Carry over
          } else {
            const amount = accumulatedValue;
            let currentBase = accumulatedValue - accumulatedExtra;
            let draftExtra = 0;
            if (currentBase >= amount) {
              draftExtra = 0;
            } else {
              draftExtra = amount - Math.max(0, currentBase);
            }
            
            accumulatedValue = 0;
            accumulatedExtra -= draftExtra;
            
            const { invoiceNo } = getMonthDates(year, m, partIndex);
            const desc = ruleset.descriptions && ruleset.descriptions.length > 0 
              ? ruleset.descriptions[Math.floor(Math.random() * ruleset.descriptions.length)]
              : "Služby";
            
            const periodLabel = getInvoiceLabel(year, m, ruleset);
            let label = `${periodLabel} (${ruleset.name}) Remainder`;
            
            if (isFlush) {
              label = `${periodLabel} (${ruleset.name})`;
              if (totalParts > 1 && partIndex > 0) {
                const remCount = totalParts - 1;
                label += remCount === 1 ? " Remainder" : ` Remainder ${partIndex}/${remCount}`;
              }
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
              monthSalary: salaryRule.value - salaryRule.deduction,
              extraValue: draftExtra > 0 ? draftExtra : undefined
            });
          }
        }
      }
    }
    
    setDrafts(newDrafts);
  }, [loading, lastInvoicedMonth, config, proplatitTotalValue, currentDate]);

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

  const openGenerateAllModal = () => {
    // Freeze the invoices list for the whole modal session so parent re-renders (sync)
    // can't cause the modal to suddenly show "0 of 0".
    setGenerateAllInvoicesSnapshot(
      drafts
        .filter(d => d.status !== 'done')
        .map(d => ({ id: d.id, label: d.label, amount: d.amount }))
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
    const dueDate = new Date(issueDate);
    dueDate.setDate(issueDate.getDate() + 14);

    const issueDateStr = `${issueDate.getDate()}. ${issueDate.getMonth() + 1}. ${issueDate.getFullYear()}`;
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
      '{{P_ACC}}': config.bankAccount,
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
    
    const outputDir = isPreview 
      ? `${config.rootPath}\\.preview`
      : `${config.rootPath}\\${yearShort}`;

    const outputPath = `${outputDir}\\${odtName}`;
    
    try {
      await mkdir(outputDir, { recursive: true });
      const templatePath = ruleset.templatePath || 'src/templates/template.odt';
      await generateInvoiceOdt(templatePath, outputPath, replacements);
      await convertToPdf(outputPath, outputDir);
      
      if (!isPreview) {
        if (itemsToMove.length > 0) {
          for (const item of itemsToMove) {
            await moveProplatitFile(config.rootPath, item.file.name);
          }
        }
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
    const draft = drafts.find(d => d.id === draftId);
    if (!draft || draft.status === 'done') return undefined;
    return handleGenerate(draft, false);
  };

  // Called when the Generate All modal completes - syncs UI with disk state
  const handleGenerateAllComplete = async () => {
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

  const totalDraftValue = drafts.reduce((sum, d) => sum + d.amount, 0);

  return (
    <div className="p-6 lg:p-8">
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
          <h2 
            className="text-2xl lg:text-3xl font-bold mb-1"
            style={{ color: 'var(--text-primary)' }}
          >
            Pending Invoices
          </h2>
          <p 
            className="text-sm"
            style={{ color: 'var(--text-muted)' }}
          >
            {drafts.length > 0 
              ? `${drafts.length} invoice${drafts.length > 1 ? 's' : ''} ready for generation`
              : 'No pending invoices at this time'
            }
          </p>
        </div>

        {drafts.length > 0 && (
          <div className="flex items-center gap-3">
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
                  {totalDraftValue.toLocaleString()} CZK
                </p>
              </div>
            </div>

            {/* Generate All Button */}
            <CauldronButton onClick={openGenerateAllModal}>
              <Sparkles size={18} className="flex-shrink-0" />
              <span>Generate All</span>
            </CauldronButton>
          </div>
        )}
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
          <button 
            onClick={() => setExtraItemsExpanded(!extraItemsExpanded)}
            className="w-full px-5 py-4 flex items-center justify-between cursor-pointer transition-colors hover:opacity-90"
            style={{ 
              backgroundColor: 'var(--bg-muted)',
              borderBottom: extraItemsExpanded ? '1px solid var(--border-default)' : 'none'
            }}
          >
            <div className="flex items-center gap-3">
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
            </div>
            <div className="flex items-center gap-4">
              <div 
                className="text-lg font-bold font-mono"
                style={{ color: 'var(--accent-600)' }}
              >
                {proplatitTotalValue.toLocaleString()} Kč
              </div>
              <ChevronDown 
                size={20} 
                style={{ 
                  color: 'var(--text-muted)',
                  transform: extraItemsExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                  transition: 'transform 0.2s ease'
                }} 
              />
            </div>
          </button>

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
              onUpdateItem={updateProplatitItem}
            />
          </div>
        </div>
      )}

        {/* Invoice Drafts */}
        <div className="space-y-4">
          {drafts.length === 0 && (
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
            className="card overflow-hidden card-hover relative"
            style={{ 
              borderLeft: draft.status === 'done' 
                ? '4px solid var(--success-500)' 
                : '4px solid var(--accent-500)'
            }}
          >
            {/* Generated Overlay */}
            {draft.status === 'done' && (
              <div 
                className="absolute inset-0 flex items-center justify-center z-10"
                style={{ backgroundColor: 'rgba(var(--success-500), 0.1)' }}
              >
                <div 
                  className="flex items-center gap-2 px-6 py-3 rounded-full"
                  style={{ 
                    backgroundColor: 'var(--success-100)',
                    color: 'var(--success-700)'
                  }}
                >
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
                    className="group flex items-center gap-2 text-xl font-bold transition-colors"
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
                  <div 
                    className="text-2xl font-bold font-mono"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    {draft.amount.toLocaleString()} Kč
                  </div>
                  
                  {draft.extraValue ? (
                    <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                      {(draft.amount - draft.extraValue) > 0 
                        ? `${(draft.amount - draft.extraValue).toLocaleString()} + ${draft.extraValue.toLocaleString()} extra`
                        : `${draft.extraValue.toLocaleString()} extra`
                      }
                    </p>
                  ) : (
                    draft.amount === config.maxInvoiceValue && draft.monthSalary > draft.amount && (
                      <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                        / {draft.monthSalary.toLocaleString()} Kč (split)
                      </p>
                    )
                  )}
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
                        const newD = [...drafts];
                        newD[i].invoiceNoOverride = e.target.value;
                        if (newD[i].variableSymbolOverride === draft.invoiceNoOverride) {
                          newD[i].variableSymbolOverride = e.target.value;
                        }
                        setDrafts(newD);
                      }}
                      className="flex-1 font-mono"
                    />
                    <input
                      type="text"
                      value={draft.variableSymbolOverride}
                      onChange={e => {
                        const newD = [...drafts];
                        newD[i].variableSymbolOverride = e.target.value;
                        setDrafts(newD);
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
                  <div className="relative">
                    <select
                      value={draft.description}
                      onChange={e => {
                        const newD = [...drafts];
                        newD[i].description = e.target.value;
                        setDrafts(newD);
                      }}
                      className="w-full"
                    >
                      {(config.rulesets.find(r => r.id === draft.rulesetId)?.descriptions || []).map(d => (
                        <option key={d} value={d}>{d}</option>
                      ))}
                    </select>
                  </div>
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
        }}
        invoices={generateAllInvoicesSnapshot}
        onGenerateInvoice={handleGenerateById}
        rootPath={config.rootPath}
        onComplete={handleGenerateAllComplete}
      />
    </div>
  );
}
