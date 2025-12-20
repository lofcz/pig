import { useState, useEffect, useMemo } from 'react';
import { convertFileSrc } from '@tauri-apps/api/core';
import { Config, CompanyDetails, Ruleset } from '../types';
import { mkdir } from '@tauri-apps/plugin-fs';
import { openPath } from '@tauri-apps/plugin-opener';
import { getProplatitFiles, FileEntry, moveProplatitFile, getExistingInvoiceCount, getMonthDates, getLastInvoicedMonth } from '../utils/logic';
import { generateInvoiceOdt, convertToPdf } from '../utils/odt';
import { escapeXml } from '../utils/helpers';

interface GeneratorProps {
  config: Config;
}

interface ProplatitItem {
  file: FileEntry;
  value: number;
  currency: 'CZK' | 'EUR' | 'USD';
  selected: boolean;
  assignedDraftId?: string;
}

interface InvoiceDraft {
  id: string; // Unique ID
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
  const [currentDate, setCurrentDate] = useState(new Date());
  const [proplatitFiles, setProplatitFiles] = useState<ProplatitItem[]>([]);
  const [drafts, setDrafts] = useState<InvoiceDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastInvoicedMonth, setLastInvoicedMonth] = useState(0);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, [config.rootPath]);

  async function loadData() {
    setLoading(true);
    const files = await getProplatitFiles(config.rootPath);
    setProplatitFiles(files.map(f => ({
      file: f,
      value: 0,
      currency: 'CZK',
      selected: true,
      assignedDraftId: undefined
    })));

    // We assume standard tracking based on year folder for now
    // If multiple rulesets exist, we might need more complex tracking.
    // But existing logic `getLastInvoicedMonth` scans the folder for `faktura_..._MM...`
    // It should pick up the max month regardless of ruleset if they share the folder.
    const yStr = currentDate.getFullYear().toString().slice(-2);
    const lastM = await getLastInvoicedMonth(config.rootPath, yStr);
    setLastInvoicedMonth(lastM);
    setLoading(false);
  }

  const proplatitTotalValue = useMemo(() => {
       return proplatitFiles.filter(p => p.selected).reduce((sum, p) => {
          let val = p.value;
          if (p.currency === 'EUR') val *= config.exchangeRates.EUR;
          if (p.currency === 'USD') val *= config.exchangeRates.USD;
          return sum + val;
       }, 0);
  }, [proplatitFiles, config.exchangeRates]);

  // Main Logic for Draft Generation
  useEffect(() => {
     if (loading) return;
     
    const newDrafts: InvoiceDraft[] = [];
    const year = currentDate.getFullYear();
    const currentMonth = currentDate.getMonth() + 1;
    
    // We assume "scio" logic: single timeline.
    // If multiple rulesets, we technically should track `lastInvoicedMonth` PER ruleset.
    // But `getLastInvoicedMonth` is global for the folder.
    // Let's iterate rulesets, but currently the file system doesn't separate them cleanly other than filename.
    // We will assume all rulesets operate on the same timeline for now (startMonth -> endMonth).

    for (const ruleset of config.rulesets) {
        const cutoffDay = ruleset.entitlementDay;
        const endMonth = currentDate.getDate() > cutoffDay ? currentMonth - 1 : currentMonth - 2;
        let startMonth = lastInvoicedMonth + 1;
        
        if (startMonth > endMonth) continue;

        let accumulatedValue = 0;
        
        // Helper to track base value consumption for extra items attribution
        let currentBasePool = 0; 
        // We need to know how much base value is in the accumulator.
        // accumulatedValue = Base + Extra.
        // But extra is added at specific points.
        // Simplified: The "Extra" part is the LAST part of the accumulator.
        // So base = accumulatedValue - totalExtraInAccumulator.
        
        // However, accumulatedValue persists across loops if minimized.
        // It's safer to track `extraPool` explicitly?
        // Let's track `accumulatedExtra`.
        let accumulatedExtra = 0;

        for (let m = startMonth; m <= endMonth; m++) {
            // 1. Calculate Monthly Value
            const dateStr = `${year}-${m.toString().padStart(2, '0')}`;
            const salaryRule = ruleset.salaryRules.find(r => dateStr >= r.startDate && dateStr <= r.endDate) 
                || { value: 0, deduction: 0 };
            
            let monthValue = salaryRule.value - salaryRule.deduction;
            
            // Add proplatit to last month of generation window
            let extraAddedThisMonth = 0;
            if (m === endMonth && config.rulesets[0].id === ruleset.id) {
                extraAddedThisMonth = proplatitTotalValue;
                monthValue += extraAddedThisMonth;
            }
            
            accumulatedValue += monthValue;
            accumulatedExtra += extraAddedThisMonth;

            // 2. Check if we should invoice this month based on Periodicity
            if (!isBillingMonth(m, ruleset)) {
                continue; // Keep accumulating
            }
            
            // Determine if we are in flush mode (Minimize Invoices + Last Month)
            const isFlush = ruleset.minimizeInvoices && (m === endMonth);
            const totalParts = isFlush ? Math.ceil(accumulatedValue / config.maxInvoiceValue) : 0;

            // Helper to distribute extra value
            const generateDraft = (amount: number, index: number, isLast: boolean) => {
                // Calculate how much of this invoice is Base vs Extra
                // Strategy: Consume Base first, then Extra.
                // Base Available = accumulatedValue (current) - accumulatedExtra.
                // Wait, accumulatedValue DECREASES as we generate.
                // accumulatedExtra should also decrease as we consume it.
                // Base = Total - Extra.
                
                let draftExtra = 0;
                const totalBase = accumulatedValue - accumulatedExtra; // Current total base available? 
                // No, accumulatedValue is the amount BEFORE this invoice is subtracted? 
                // In `while` loop, I subtract `amount` AFTER generation? No, before `newDrafts.push` in original code?
                // Let's verify loop order.
            };
            
            // 3. Generate Invoices from Accumulator
            let partIndex = 0;
            
            // While we have enough for a max-value invoice
            while (accumulatedValue >= config.maxInvoiceValue) {
                const amount = config.maxInvoiceValue;
                // Calculate composition
                // We consume Base first.
                // Base Available = accumulatedValue - accumulatedExtra.
                // If Base Available >= amount, then Draft is all Base.
                // If Base Available < amount, then Draft is (Base Available) Base + (amount - Base Available) Extra.
                
                let currentBase = accumulatedValue - accumulatedExtra;
                let draftExtra = 0;
                
                if (currentBase >= amount) {
                    draftExtra = 0;
                } else {
                    draftExtra = amount - Math.max(0, currentBase);
                }
                
                // Update accumulators
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
            
            // Remainder invoice
            if (accumulatedValue > 0) {
                 // If minimizeInvoices is ON, and this is NOT the last month, carry over.
                 if (ruleset.minimizeInvoices && m !== endMonth) {
                     // Carry over to next month
                 } else {
                     const amount = accumulatedValue;
                     // Composition
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
          case 'custom_days': return true; // Fallback to monthly
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

  // Handle Generation
  const generateAll = async () => {
      for (const draft of drafts) {
          if (draft.status === 'done') continue;
          await handleGenerate(draft, false);
      }
      alert("All invoices generated!");
      loadData();
  };

  const handleGenerate = async (draft: InvoiceDraft, isPreview: boolean = false) => {
    // Determine Ruleset
    const ruleset = config.rulesets.find(r => r.id === draft.rulesetId);
    if (!ruleset) { alert("Ruleset not found"); return undefined; }

    const isLastDraft = drafts[drafts.length - 1].id === draft.id;
    const itemsToMove = (!isPreview && isLastDraft) ? proplatitFiles.filter(p => p.selected) : [];

    let day = "1";
    if (draft.invoiceNoOverride.length === 8) {
        day = parseInt(draft.invoiceNoOverride.substring(0, 2)).toString();
    }

    const issueDate = new Date(draft.year, draft.month - 1, parseInt(day));
    const dueDate = new Date(issueDate);
    dueDate.setDate(issueDate.getDate() + 14);

    const issueDateStr = `${issueDate.getDate()}. ${issueDate.getMonth() + 1}. ${issueDate.getFullYear()}`;
    const dueDateStr = `${dueDate.getDate()}. ${dueDate.getMonth() + 1}. ${dueDate.getFullYear()}`;

    // Customer Resolution (Top -> Bottom)
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
    const amountStr = draft.amount.toLocaleString('cs-CZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " Kč";

    const replacements: Record<string, string> = {
      '{{P_NO}}': draft.invoiceNoOverride,
      '{{P_ISSUED}}': issueDateStr,
      '{{P_DUZP}}': issueDateStr,
      '{{P_DUE}}': dueDateStr,
      '{{P_VS}}': draft.variableSymbolOverride,
      '{{P_ACC}}': config.bankAccount,
      '{{P_SUPPLIER}}': companyToXml(supplier, "DODAVATEL"),
      '{{P_CUSTOMER}}': companyToXml(customer, "ODBĚRATEL"),
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

  const handlePreview = async (draft: InvoiceDraft) => {
      const path = await handleGenerate(draft, true);
      if (path) {
          await openPath(path);
      }
  };

  function companyToXml(c: CompanyDetails, role: string): string {
    let xml = `<text:h text:style-name="Heading3" text:outline-level="3"><text:line-break/>${escapeXml(role)}</text:h>`;
    xml += `<text:h text:style-name="Heading3" text:outline-level="3"><text:line-break/>${escapeXml(c.name)}</text:h>`;
    xml += `<text:p text:style-name="P72">${escapeXml(c.street)}</text:p>`;
    xml += `<text:p text:style-name="P72">${escapeXml(c.zip)} ${escapeXml(c.city)}</text:p>`;
    xml += `<text:p text:style-name="P72">${escapeXml(c.country)}</text:p>`;
    xml += `<text:h text:style-name="Heading3" text:outline-level="3">IČ: ${escapeXml(c.ic)}</text:h>`;
    if (c.dic) xml += `<text:h text:style-name="Heading3" text:outline-level="3">DIČ: ${escapeXml(c.dic)}</text:h>`;
    return xml;
  }

  const totalDraftValue = drafts.reduce((sum, d) => sum + d.amount, 0);

  return (
    <div className="p-6 bg-white min-h-screen">
       <div className="flex justify-between items-center mb-6">
           <h2 className="text-3xl font-bold text-gray-800">Pending Invoices</h2>
           <div className="flex items-center gap-4">
             {drafts.length > 0 && (
                 <div className="text-sm text-gray-500 text-right leading-tight">
                     <div className="font-bold text-gray-700">{totalDraftValue.toLocaleString()} CZK</div>
                     <div>in {drafts.length} invoices</div>
                 </div>
             )}
             <button 
               onClick={generateAll}
               className="px-6 py-3 bg-green-600 text-white font-bold rounded shadow hover:bg-green-700"
             >
               Generate All
             </button>
           </div>
       </div>

       {drafts.length > 0 && (
           <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded text-blue-800">
               <span className="font-bold">Billing Periods:</span> {Array.from(new Set(drafts.map(d => d.periodLabel))).join(', ')}
           </div>
       )}

       {proplatitFiles.length > 0 && (
         <div className="mb-8 p-4 border rounded bg-gray-50">
             <h3 className="font-bold mb-2">Extra items</h3>
             {proplatitFiles.map((p, i) => (
                 <div key={i} className="flex gap-4 items-center">
                     <span 
                        className="text-blue-600 underline cursor-pointer hover:text-blue-800"
                        onClick={() => openPath(p.file.path)}
                     >
                        {p.file.name}
                     </span>
                     <input type="number" className="border p-1 w-24" value={p.value} onChange={e => {
                         const newF = [...proplatitFiles];
                         newF[i].value = Number(e.target.value);
                         setProplatitFiles(newF);
                     }} />
                     <select className="border p-1" value={p.currency} onChange={e => {
                         const newF = [...proplatitFiles];
                         newF[i].currency = e.target.value as any;
                         setProplatitFiles(newF);
                     }}><option>CZK</option><option>EUR</option><option>USD</option></select>
                     <label><input type="checkbox" checked={p.selected} onChange={e => {
                         const newF = [...proplatitFiles];
                         newF[i].selected = e.target.checked;
                         setProplatitFiles(newF);
                     }} /> Include</label>
                 </div>
             ))}
             <div className="mt-2 text-right font-bold text-blue-600">Total Extra: {proplatitTotalValue.toLocaleString()} Kč</div>
         </div>
       )}

       <div className="space-y-8">
           {drafts.length === 0 && <p className="text-gray-500 italic">No pending invoices found.</p>}
           {drafts.map((draft, i) => (
               <div key={draft.id} className="border rounded shadow-sm p-4 bg-white relative">
                   {draft.status === 'done' && <div className="absolute inset-0 bg-green-50/80 flex items-center justify-center font-bold text-green-700 text-xl z-10">Generated</div>}
                   <div className="flex justify-between mb-2">
                       <h3 
                           className="font-bold text-lg text-blue-600 hover:text-blue-800 hover:underline cursor-pointer"
                           onClick={() => handlePreview(draft)}
                       >
                           {draft.label}
                       </h3>
                       <div className="font-mono text-xl">
                           {draft.amount.toLocaleString()} Kč
                           
                           {draft.extraValue ? (
                               <span className="text-sm text-gray-500 ml-2">
                                   {(draft.amount - draft.extraValue) > 0 
                                     ? `(${(draft.amount - draft.extraValue).toLocaleString()} remainder + ${draft.extraValue.toLocaleString()} extra)`
                                     : `(${draft.extraValue.toLocaleString()} extra)`
                                   }
                               </span>
                           ) : (
                               draft.monthSalary > draft.amount && (
                                   <span className="text-sm text-gray-500 ml-2">
                                       / {draft.monthSalary.toLocaleString()} Kč (split)
                                   </span>
                               )
                           )}
                       </div>
                   </div>
                   <div className="grid grid-cols-2 gap-4">
                       <div>
                           <label className="text-xs text-gray-500 font-bold">Number / VS</label>
                           <div className="flex gap-2">
                               <input className="border p-1 w-full rounded" value={draft.invoiceNoOverride} onChange={e => {
                                   const newD = [...drafts];
                                   newD[i].invoiceNoOverride = e.target.value;
                                   if (newD[i].variableSymbolOverride === draft.invoiceNoOverride) newD[i].variableSymbolOverride = e.target.value;
                                   setDrafts(newD);
                               }} />
                               <input className="border p-1 w-full rounded" value={draft.variableSymbolOverride} onChange={e => {
                                   const newD = [...drafts];
                                   newD[i].variableSymbolOverride = e.target.value;
                                   setDrafts(newD);
                               }} />
                           </div>
                       </div>
                       <div>
                           <label className="text-xs text-gray-500 font-bold">Description</label>
                           <select className="border p-1 w-full rounded" value={draft.description} onChange={e => {
                               const newD = [...drafts];
                               newD[i].description = e.target.value;
                               setDrafts(newD);
                           }}>
                               {(config.rulesets.find(r => r.id === draft.rulesetId)?.descriptions || []).map(d => <option key={d} value={d}>{d}</option>)}
                           </select>
                       </div>
                   </div>
               </div>
           ))}
       </div>

    </div>
  );
}
