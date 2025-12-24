import { useCallback } from 'react';
import { mkdir, readFile } from '@tauri-apps/plugin-fs';
import { toast } from 'sonner';
import { Config, CompanyDetails } from '../../types';
import { moveProplatitFile, ensureYearFolder } from '../../utils/logic';
import { generateInvoiceOdt, convertToPdf } from '../../utils/odt';
import { loadGlobalSettings } from '../../utils/globalSettings';
import { modal } from '../../contexts/ModalContext';
import { PDFPreviewModal } from '../modals/PDFPreviewModal';
import { InvoiceDraft, AdhocInvoice, DraftUserEdits } from './types';
import { buildInvoiceReplacements, formatDateCzech, formatAmountCzech } from './utils';

interface SelectedProplatitFile {
  file: { path: string; name: string };
  value: number;
  selected: boolean;
}

export interface UseInvoiceGenerationProps {
  config: Config;
  drafts: InvoiceDraft[];
  adhocInvoices: AdhocInvoice[];
  selectedProplatitFiles: SelectedProplatitFile[];
  userEditsRef: React.MutableRefObject<Map<string, DraftUserEdits>>;
  setDrafts: React.Dispatch<React.SetStateAction<InvoiceDraft[]>>;
}

export interface UseInvoiceGenerationReturn {
  handleGenerate: (draft: InvoiceDraft, isPreview?: boolean) => Promise<string | undefined>;
  handleGenerateById: (draftId: string) => Promise<string | undefined>;
  handlePreview: (draft: InvoiceDraft) => Promise<void>;
  handlePreviewAdhocInvoice: (invoice: AdhocInvoice) => Promise<void>;
  handleGenerateAdhocInvoice: (invoice: AdhocInvoice) => Promise<string | undefined>;
}

export function useInvoiceGeneration({
  config,
  drafts,
  adhocInvoices,
  selectedProplatitFiles,
  userEditsRef,
  setDrafts,
}: UseInvoiceGenerationProps): UseInvoiceGenerationReturn {

  const handleGenerate = useCallback(async (draft: InvoiceDraft, isPreview: boolean = false): Promise<string | undefined> => {
    const ruleset = config.rulesets.find(r => r.id === draft.rulesetId);
    if (!ruleset) { alert("Ruleset not found"); return undefined; }

    const isLastDraft = drafts[drafts.length - 1].id === draft.id;
    const itemsToMove = (!isPreview && isLastDraft) ? selectedProplatitFiles : [];

    let day = "1";
    if (draft.invoiceNoOverride.length === 8) {
      day = parseInt(draft.invoiceNoOverride.substring(0, 2)).toString();
    }

    const issueDate = new Date(draft.year, draft.month - 1, parseInt(day));
    const issueDateStr = formatDateCzech(issueDate);
    
    // Due date is calculated from current date + configurable offset (default 14 days)
    const dueDateOffsetDays = ruleset.dueDateOffsetDays ?? 14;
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + dueDateOffsetDays);
    const dueDateStr = formatDateCzech(dueDate);

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
    const amountStr = formatAmountCzech(draft.amount);

    const replacements = buildInvoiceReplacements(
      supplier,
      customer,
      draft.invoiceNoOverride,
      draft.variableSymbolOverride,
      issueDateStr,
      dueDateStr,
      draft.description,
      amountStr
    );

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
  }, [config, drafts, selectedProplatitFiles, userEditsRef, setDrafts]);

  const handleGenerateAdhocInvoice = useCallback(async (invoice: AdhocInvoice): Promise<string | undefined> => {
    try {
      const supplier = config.companies.find(c => c.id === invoice.supplierId);
      const customer = config.companies.find(c => c.id === invoice.customerId);
      
      if (!supplier || !customer) {
        toast.error('Supplier or customer not found');
        return undefined;
      }

      const issueDate = new Date(invoice.issueDate);
      const issueDateStr = formatDateCzech(issueDate);
      
      const dueDate = new Date(invoice.dueDate);
      const dueDateStr = formatDateCzech(dueDate);

      const amountStr = formatAmountCzech(invoice.value);

      const replacements = buildInvoiceReplacements(
        supplier,
        customer,
        invoice.invoiceNo,
        invoice.variableSymbol,
        issueDateStr,
        dueDateStr,
        invoice.description,
        amountStr
      );

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
  }, [config]);

  const handleGenerateById = useCallback(async (draftId: string): Promise<string | undefined> => {
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
  }, [drafts, adhocInvoices, handleGenerate, handleGenerateAdhocInvoice]);

  const handlePreview = useCallback(async (draft: InvoiceDraft) => {
    await modal.open(PDFPreviewModal, {
      title: `Preview: ${draft.label}`,
      generator: async () => {
        const path = await handleGenerate(draft, true);
        if (!path) return null;
        
        const pdfData = await readFile(path);
        const blob = new Blob([pdfData], { type: 'application/pdf' });
        return URL.createObjectURL(blob);
      }
    });
  }, [handleGenerate]);

  const handlePreviewAdhocInvoice = useCallback(async (invoice: AdhocInvoice) => {
    await modal.open(PDFPreviewModal, {
      title: `Preview: ${invoice.name}`,
      generator: async () => {
        const supplier = config.companies.find(c => c.id === invoice.supplierId);
        const customer = config.companies.find(c => c.id === invoice.customerId);
        
        if (!supplier || !customer) {
          toast.error('Supplier or customer not found');
          return null;
        }

        const issueDate = new Date(invoice.issueDate);
        const issueDateStr = formatDateCzech(issueDate);
        
        const dueDate = new Date(invoice.dueDate);
        const dueDateStr = formatDateCzech(dueDate);

        const amountStr = formatAmountCzech(invoice.value);

        const replacements = buildInvoiceReplacements(
          supplier,
          customer,
          invoice.invoiceNo,
          invoice.variableSymbol,
          issueDateStr,
          dueDateStr,
          invoice.description,
          amountStr
        );

        const outputDir = `${config.rootPath}\\.preview`;
        const baseName = `adhoc_${invoice.invoiceNo}`;
        const outputPath = `${outputDir}\\${baseName}.odt`;

        await mkdir(outputDir, { recursive: true });
        
        const templatePath = config.rulesets[0]?.templatePath || 'src/templates/template.odt';
        
        await generateInvoiceOdt(templatePath, outputPath, replacements);
        await convertToPdf(outputPath, outputDir, loadGlobalSettings().sofficePath);
        
        const pdfPath = outputPath.replace('.odt', '.pdf');
        const pdfData = await readFile(pdfPath);
        const blob = new Blob([pdfData], { type: 'application/pdf' });
        return URL.createObjectURL(blob);
      }
    });
  }, [config]);

  return {
    handleGenerate,
    handleGenerateById,
    handlePreview,
    handlePreviewAdhocInvoice,
    handleGenerateAdhocInvoice,
  };
}
