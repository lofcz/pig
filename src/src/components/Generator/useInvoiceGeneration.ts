import { useCallback } from 'react';
import { mkdir, readFile } from '@tauri-apps/plugin-fs';
import { toast } from 'sonner';
import { Config, CompanyDetails } from '../../types';
import { moveProplatitFile, ensureYearFolder } from '../../utils/logic';
import { generateInvoiceOdt, convertToPdf } from '../../utils/odt';
import { loadGlobalSettings, validateSofficeConfiguration } from '../../utils/globalSettings';
import { modal } from '../../contexts/ModalContext';
import { PDFPreviewModal } from '../modals/PDFPreviewModal';
import { useGeneratorStore } from '../../stores/generatorStore';
import { InvoiceDraft, AdhocInvoice } from './types';
import { getAdhocInvoiceParts } from './adhocSplit';
import { buildInvoiceReplacements, formatDateCzech, formatAmountCzech } from './utils';

interface SelectedProplatitFile {
  file: { path: string; name: string };
  value: number;
  selected: boolean;
}

export interface UseInvoiceGenerationProps {
  config: Config;
  adhocInvoices: AdhocInvoice[];
  selectedProplatitFiles: SelectedProplatitFile[];
}

export interface UseInvoiceGenerationReturn {
  handleGenerate: (draft: InvoiceDraft, isPreview?: boolean) => Promise<string | undefined>;
  handleGenerateById: (draftId: string) => Promise<string | undefined>;
  handlePreview: (draft: InvoiceDraft) => Promise<void>;
  handlePreviewAdhocInvoice: (invoice: AdhocInvoice, partIndex?: number) => Promise<void>;
  handleGenerateAdhocInvoice: (invoice: AdhocInvoice, isPreview?: boolean, partIndex?: number) => Promise<string | undefined>;
}

export function useInvoiceGeneration({
  config,
  adhocInvoices,
  selectedProplatitFiles,
}: UseInvoiceGenerationProps): UseInvoiceGenerationReturn {

  const ensurePreviewAvailable = useCallback(async (): Promise<boolean> => {
    const result = await validateSofficeConfiguration();
    if (!result.valid) {
      toast.error(result.message);
      return false;
    }
    return true;
  }, []);

  const handleGenerate = useCallback(async (draft: InvoiceDraft, isPreview: boolean = false): Promise<string | undefined> => {
    const ruleset = config.rulesets.find(r => r.id === draft.rulesetId);
    if (!ruleset) {
      toast.error('The invoice ruleset could not be found');
      return undefined;
    }

    // Read drafts non-reactively from the store: this callback only fires on
    // explicit user action (click "Generate"), so subscribing here would just
    // re-create the callback on every keystroke for no benefit.
    const drafts = useGeneratorStore.getState().drafts;
    const isLastDraft = drafts[drafts.length - 1]?.id === draft.id;
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
    
    if (!customer) {
      toast.error(`No customer is configured for ${draft.month}/${draft.year} in ${ruleset.name}`);
      return undefined;
    }
    
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
      // Preview folders are intentionally hidden and may not exist yet.
      // Real generation folders are already created by ensureYearFolder.
      await mkdir(outputDir, { recursive: true });
      const templatePath = ruleset.templatePath || 'src/templates/template.odt';
      await generateInvoiceOdt(templatePath, outputPath, replacements);
      await convertToPdf(outputPath, outputDir, loadGlobalSettings().sofficePath);
      
      if (!isPreview) {
        if (itemsToMove.length > 0) {
          for (const item of itemsToMove) {
            await moveProplatitFile(config.rootPath, item.file.name, config.projectStructure);
          }
        }
        const { removeUserEdit, markDraftDone } = useGeneratorStore.getState();
        removeUserEdit(draft.id);
        markDraftDone(draft.id);
      }
      
      return outputPath.replace('.odt', '.pdf');
    } catch (e) {
      console.error(`Failed to generate ${baseName}:`, e);
      toast.error(`Generation failed: ${e instanceof Error ? e.message : String(e)}`);
      return undefined;
    }
  }, [config, selectedProplatitFiles]);

  const handleGenerateAdhocInvoice = useCallback(async (invoice: AdhocInvoice, isPreview: boolean = false, partIndex: number = 0): Promise<string | undefined> => {
    try {
      const supplier = config.companies.find(c => c.id === invoice.supplierId);
      const customer = config.companies.find(c => c.id === invoice.customerId);

      if (!supplier || !customer) {
        toast.error('Supplier or customer not found');
        return undefined;
      }

      // Derive the part to generate. Variable symbols are normalized to digits,
      // and split parts receive unique zero-padded numeric suffixes.
      const parts = getAdhocInvoiceParts(invoice, config);
      const part = parts[partIndex];
      if (!part) {
        toast.error(`Invalid part index ${partIndex} for ${invoice.name}`);
        return undefined;
      }

      const issueDate = new Date(invoice.issueDate);
      const issueDateStr = formatDateCzech(issueDate);

      const dueDate = new Date(invoice.dueDate);
      const dueDateStr = formatDateCzech(dueDate);

      const amountStr = formatAmountCzech(part.amount);

      const replacements = buildInvoiceReplacements(
        supplier,
        customer,
        part.invoiceNo,
        part.variableSymbol,
        issueDateStr,
        dueDateStr,
        part.description,
        amountStr
      );

      // For previews, write to a hidden .preview folder so we never pollute the
      // real invoices directory. For real generation, use the year folder.
      const outputDir = isPreview
        ? `${config.rootPath}\\.preview`
        : await ensureYearFolder(config.rootPath, issueDate.getFullYear(), config.projectStructure);

      await mkdir(outputDir, { recursive: true });

      // Normalize the name for filename: remove diacritics, lowercase, replace spaces with underscores
      const normalizedName = invoice.name
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // Remove diacritics
        .toLowerCase()
        .replace(/\s+/g, '_') // Replace spaces with underscores
        .replace(/[^a-z0-9_]/g, ''); // Remove any other special characters

      // Distinct filename per part so split invoices don't overwrite each other.
      const partSuffix = part.isSplit ? `_part${part.partIndex + 1}` : '';
      const baseName = `faktura_adhoc_${normalizedName}_${invoice.invoiceNo}${partSuffix}`;
      const outputPath = `${outputDir}\\${baseName}.odt`;

      // Prefer the parent ruleset's template when parented, then fall back to
      // the first ruleset, then the bundled default.
      const parentedRuleset = invoice.rulesetId
        ? config.rulesets.find(r => r.id === invoice.rulesetId)
        : undefined;
      const templatePath = parentedRuleset?.templatePath
        || config.rulesets[0]?.templatePath
        || 'src/templates/template.odt';

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
    // Check if this is an adhoc invoice (prefixed with "adhoc:"). Split adhocs
    // carry a `#partK` suffix selecting which part to generate; unsplit adhocs
    // keep the bare `adhoc:${id}` form.
    if (draftId.startsWith('adhoc:')) {
      const rest = draftId.replace('adhoc:', '');
      const hashIdx = rest.indexOf('#part');
      const adhocId = hashIdx >= 0 ? rest.substring(0, hashIdx) : rest;
      const partIndex = hashIdx >= 0 ? parseInt(rest.substring(hashIdx + 5), 10) : 0;
      const adhocInvoice = adhocInvoices.find(inv => inv.id === adhocId);
      if (!adhocInvoice) return undefined;
      return handleGenerateAdhocInvoice(adhocInvoice, false, isNaN(partIndex) ? 0 : partIndex);
    }

    // Regular draft — read from the store at call time (non-reactive).
    const draft = useGeneratorStore.getState().drafts.find(d => d.id === draftId);
    if (!draft || draft.status === 'done') return undefined;
    return handleGenerate(draft, false);
  }, [adhocInvoices, handleGenerate, handleGenerateAdhocInvoice]);

  const handlePreview = useCallback(async (draft: InvoiceDraft) => {
    if (!(await ensurePreviewAvailable())) return;

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
  }, [ensurePreviewAvailable, handleGenerate]);

  const handlePreviewAdhocInvoice = useCallback(async (invoice: AdhocInvoice, partIndex: number = 0) => {
    if (!(await ensurePreviewAvailable())) return;

    const parts = getAdhocInvoiceParts(invoice, config);
    const part = parts[partIndex];
    const title = part ? `Preview: ${part.label}` : `Preview: ${invoice.name}`;
    await modal.open(PDFPreviewModal, {
      title,
      generator: async () => {
        // Reuse the canonical adhoc generator in preview mode. It writes to
        // .preview (never the real invoices folder) and surfaces any error
        // via toast before returning undefined, so the user always sees why
        // the preview failed instead of a silent "No PDF available".
        const pdfPath = await handleGenerateAdhocInvoice(invoice, true, partIndex);
        if (!pdfPath) return null;

        const pdfData = await readFile(pdfPath);
        const blob = new Blob([pdfData], { type: 'application/pdf' });
        return URL.createObjectURL(blob);
      }
    });
  }, [config, ensurePreviewAvailable, handleGenerateAdhocInvoice]);

  return {
    handleGenerate,
    handleGenerateById,
    handlePreview,
    handlePreviewAdhocInvoice,
    handleGenerateAdhocInvoice,
  };
}
