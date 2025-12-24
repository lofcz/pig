import { useState, useEffect, useRef, useCallback, forwardRef, useImperativeHandle } from 'react';
import { Config } from '../types';
import { getLastInvoicedMonth } from '../utils/logic';
import { isAnalysisAvailable } from '../utils/analyzeExtraItems';
import { modal } from '../contexts/ModalContext';
import { GenerateAllModalComponent } from './GenerateAllModal';
import { useProplatitFiles } from '../hooks';
import { Loader2 } from 'lucide-react';

import {
  GeneratorRef,
  InvoiceDraft,
  DraftUserEdits,
  useBaseDrafts,
  applyExtraValueToDrafts,
  mergeDraftsWithUserEdits,
  useAdhocInvoices,
  useExtraItemsAnalysis,
  useInvoiceGeneration,
  findCustomerForDraft,
  AdhocInvoicesList,
  ExtraItemsSection,
  GeneratorHeader,
  InvoiceDraftCard,
  BillingPeriodBadge,
  EmptyState
} from './Generator/index';

interface GeneratorProps {
  config: Config;
}

export type { GeneratorRef };

const Generator = forwardRef<GeneratorRef, GeneratorProps>(function Generator({ config }, ref) {
  const [currentDate] = useState(new Date());
  const [drafts, setDrafts] = useState<InvoiceDraft[]>([]);
  const [lastInvoicedMonth, setLastInvoicedMonth] = useState(0);
  const [lastInvoicedMonthLoading, setLastInvoicedMonthLoading] = useState(true);
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

  // Manual refresh state
  const [refreshing, setRefreshing] = useState(false);
  
  // AI Analysis availability state (managed separately for imperative refresh)
  const [canAnalyze, setCanAnalyze] = useState(false);

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

  // Adhoc invoices hook
  const {
    adhocInvoices,
    openAddAdhocModal,
    openEditAdhocModal,
    handleRemoveAdhocInvoice,
    clearAdhocInvoices,
    adhocTotal,
  } = useAdhocInvoices({
    companies: config.companies,
    primaryCurrency: config.primaryCurrency,
  });

  // Extra items analysis hook
  const {
    analyzing,
    analysisProgress,
    canAnalyze: analysisCanAnalyze,
    analyzingIndices,
    refreshAnalysisAvailability,
    handleAnalyzeExtraItems,
  } = useExtraItemsAnalysis({
    rootPath: config.rootPath,
    primaryCurrency: config.primaryCurrency,
    items: proplatitFiles,
    updateItem: updateProplatitItem,
  });

  // Invoice generation hook
  const {
    handleGenerateById,
    handlePreview,
    handlePreviewAdhocInvoice,
  } = useInvoiceGeneration({
    config,
    drafts,
    adhocInvoices,
    selectedProplatitFiles,
    userEditsRef,
    setDrafts,
  });

  const loading = proplatitLoading || lastInvoicedMonthLoading;

  // Expose method to refresh analysis availability without re-rendering parent
  useImperativeHandle(ref, () => ({
    refreshAnalysisAvailability: () => {
      isAnalysisAvailable(config.rootPath).then(setCanAnalyze);
      refreshAnalysisAvailability();
    }
  }));

  // Check if AI analysis is available on mount or when rootPath changes
  useEffect(() => {
    isAnalysisAvailable(config.rootPath).then(setCanAnalyze);
  }, [config.rootPath]);

  // Reusable function to reload the last invoiced month from disk
  const reloadLastInvoicedMonth = useCallback(async () => {
    setLastInvoicedMonthLoading(true);
    const yStr = currentDate.getFullYear().toString().slice(-2);
    const lastM = await getLastInvoicedMonth(config.rootPath, yStr, config.projectStructure);
    setLastInvoicedMonth(lastM);
    setLastInvoicedMonthLoading(false);
  }, [config.rootPath, config.projectStructure, currentDate]);

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
  }, [refreshing, loadProplatitFiles, reloadLastInvoicedMonth]);

  // Load on mount and when config changes
  useEffect(() => {
    reloadLastInvoicedMonth();
  }, [reloadLastInvoicedMonth]);

  // Calculate base drafts (without extra value) using extracted hook
  const baseDrafts = useBaseDrafts({
    config,
    currentDate,
    lastInvoicedMonth,
    lastInvoicedMonthLoading,
    totalOverrides,
    calculatedTotalsRef,
    computedBaseTotalsRef,
  });

  // Apply extra value to base drafts and merge with user edits
  // This runs when base drafts change OR when extra value changes
  useEffect(() => {
    if (proplatitLoading || lastInvoicedMonthLoading) return;
    
    // Calculate total extra including adhoc invoices
    const totalExtraValue = proplatitTotalValue + adhocTotal;
    
    // Apply extra value to base drafts using extracted function
    const draftsWithExtra = applyExtraValueToDrafts(baseDrafts, totalExtraValue, config);
    
    // Merge with existing drafts, preserving user edits (non-amount fields) and status
    setDrafts(prevDrafts => 
      mergeDraftsWithUserEdits(draftsWithExtra, prevDrafts, userEditsRef.current)
    );
  }, [baseDrafts, proplatitTotalValue, adhocTotal, proplatitLoading, lastInvoicedMonthLoading, config]);

  // Called when the Generate All modal completes - syncs UI with disk state
  const handleGenerateAllComplete = useCallback(async () => {
    // Clear user edits since we're reloading everything
    userEditsRef.current.clear();
    // Clear adhoc invoices since they've been generated
    clearAdhocInvoices();
    // Clear total overrides since they applied to the generated periods
    setTotalOverrides(new Map());
    // Reload both proplatit files and last invoiced month from disk
    // This will trigger drafts recalculation via useEffect
    await Promise.all([
      loadProplatitFiles(),
      reloadLastInvoicedMonth()
    ]);
  }, [clearAdhocInvoices, loadProplatitFiles, reloadLastInvoicedMonth]);

  // Build invoice snapshots for Generate All modal
  const buildInvoiceSnapshots = useCallback(() => {
    const regularDrafts = drafts
      .filter(d => d.status !== 'done')
      .map(d => {
        const customer = findCustomerForDraft(d, config);
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
    
    return [...regularDrafts, ...adhocDrafts];
  }, [drafts, adhocInvoices, config]);

  // Build extra files snapshots for Generate All modal
  const buildExtraFilesSnapshots = useCallback(() => {
    return selectedProplatitFiles.map(item => ({
      // Replace 'proplatit' with 'proplaceno' in the path since files get moved during generation
      path: item.file.path.replace(/proplatit([\\\/])/i, 'proplaceno$1'),
      name: item.file.name
    }));
  }, [selectedProplatitFiles]);

  // Handler to open Generate All modal using context
  const openGenerateAllModal = useCallback(async () => {
    await modal.open(GenerateAllModalComponent, {
      config,
      invoices: buildInvoiceSnapshots(),
      extraFiles: buildExtraFilesSnapshots(),
      primaryCurrency: config.primaryCurrency,
      rootPath: config.rootPath,
      onGenerateInvoice: handleGenerateById,
      onComplete: handleGenerateAllComplete,
    });
  }, [config, buildInvoiceSnapshots, buildExtraFilesSnapshots, handleGenerateById, handleGenerateAllComplete]);

  // Draft update handler for child components
  const handleUpdateDraft = useCallback((index: number, updates: Partial<InvoiceDraft>) => {
    setDrafts(ds => ds.map((d, idx) => 
      idx === index ? { ...d, ...updates } : d
    ));
  }, []);

  // Track user edits handler for child components
  const handleTrackUserEdit = useCallback((draftId: string, edits: Partial<DraftUserEdits>) => {
    const existingEdits = userEditsRef.current.get(draftId) || {};
    userEditsRef.current.set(draftId, { ...existingEdits, ...edits });
  }, []);

  const totalDraftValue = drafts.reduce((sum, d) => sum + d.amount, 0) + adhocTotal;

  // Helper to check if there are any invoices ready for generation
  const hasActiveInvoices = drafts.length > 0 || adhocInvoices.length > 0;

  // Use canAnalyze from the analysis hook, combined with local state
  const effectiveCanAnalyze = canAnalyze || analysisCanAnalyze;

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8">
      {loading ? (
        <div className="p-8 flex items-center justify-center min-h-[400px]">
          <div className="flex flex-col items-center gap-4">
            <Loader2 size={32} className="animate-spin" style={{ color: 'var(--accent-500)' }} />
            <p style={{ color: 'var(--text-muted)' }} className="text-sm font-medium">Loading invoices...</p>
          </div>
        </div>
      ) : (
      <>
        <GeneratorHeader
          hasActiveInvoices={hasActiveInvoices}
          invoiceCount={drafts.length + adhocInvoices.length}
          totalValue={totalDraftValue}
          primaryCurrency={config.primaryCurrency}
          refreshing={refreshing}
          loading={loading}
          onRefresh={handleRefresh}
          onAddAdhoc={openAddAdhocModal}
          onGenerateAll={openGenerateAllModal}
        />

        <BillingPeriodBadge drafts={drafts} />

        <ExtraItemsSection
          items={proplatitFiles}
          primaryCurrency={config.primaryCurrency}
          totalValue={proplatitTotalValue}
          onUpdateItem={updateProplatitItem}
          canAnalyze={effectiveCanAnalyze}
          analyzing={analyzing}
          analysisProgress={analysisProgress}
          analyzingIndices={analyzingIndices}
          onAnalyze={handleAnalyzeExtraItems}
        />

        <AdhocInvoicesList
          invoices={adhocInvoices}
          primaryCurrency={config.primaryCurrency}
          onPreview={handlePreviewAdhocInvoice}
          onEdit={openEditAdhocModal}
          onRemove={handleRemoveAdhocInvoice}
        />

        {/* Invoice Drafts */}
        <div className="space-y-4">
          {!hasActiveInvoices && <EmptyState />}

          {drafts.map((draft, i) => (
            <InvoiceDraftCard
              key={draft.id}
              draft={draft}
              index={i}
              config={config}
              drafts={drafts}
              editingAmountId={editingAmountId}
              totalOverrides={totalOverrides}
              computedBaseTotals={computedBaseTotalsRef.current}
              onPreview={handlePreview}
              onSetEditingAmountId={setEditingAmountId}
              onSetTotalOverrides={setTotalOverrides}
              onUpdateDraft={handleUpdateDraft}
              onTrackUserEdit={handleTrackUserEdit}
            />
          ))}
        </div>
      </>
      )}
    </div>
  );
});

export default Generator;