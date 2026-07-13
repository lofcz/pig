import { useState, useEffect, useRef, useCallback, forwardRef, useImperativeHandle } from 'react';
import { Config } from '../types';
import { getLastInvoicedMonthAbs } from '../utils/logic';
import { isAnalysisAvailable } from '../utils/analyzeExtraItems';
import { modal } from '../contexts/ModalContext';
import { GenerateAllModalComponent } from './GenerateAllModal';
import { useReimburseFiles } from '../hooks';
import { useProjectWatcher } from '../contexts/ProjectWatcherContext';
import { Loader2 } from 'lucide-react';
import {
  useGeneratorStore,
  useDraftCount,
  useDraftsTotalValue,
  useSortedDraftIds,
  useLastInvoicedMonthAbs,
  useLastInvoicedMonthLoading,
  useTotalOverrides,
} from '../stores/generatorStore';

import {
  GeneratorRef,
  useBaseDrafts,
  applyExtraValueToDrafts,
  getAdhocInvoiceParts,
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

  // Store-driven slices that participate in the high-traffic edit path. These
  // selectors return primitives or shallowly-stable arrays/maps so editing a
  // draft's text fields (description / invoiceNo / VS) doesn't re-render the
  // Generator shell — only the affected card subscribes to that draft's identity.
  const draftCount = useDraftCount();
  const draftsTotal = useDraftsTotalValue();
  const sortedIds = useSortedDraftIds();
  const lastInvoicedMonthAbs = useLastInvoicedMonthAbs();
  const lastInvoicedMonthLoading = useLastInvoicedMonthLoading();
  const totalOverrides = useTotalOverrides();
  const setLastInvoicedMonthAbs = useGeneratorStore((s) => s.setLastInvoicedMonthAbs);
  const setLastInvoicedMonthLoading = useGeneratorStore((s) => s.setLastInvoicedMonthLoading);
  const mergeBaseDrafts = useGeneratorStore((s) => s.mergeBaseDrafts);
  const clearOverrides = useGeneratorStore((s) => s.clearOverrides);
  const clearUserEdits = useGeneratorStore((s) => s.clearUserEdits);
  const resetGeneratorState = useGeneratorStore((s) => s.resetGeneratorState);

  // Store calculated totals (before user overrides) for reset functionality
  // Key: `${rulesetId}-${year}-${month}`, Value: calculated total for that period
  const calculatedTotalsRef = useRef<Map<string, number>>(new Map());
  // Store the period's own base salary (excluding carryover from previous periods).
  // Used to decide whether an override is "effective" - the override replaces this period's
  // own salary contribution while preserving carryover from prior periods.
  const computedBaseTotalsRef = useRef<Map<string, number>>(new Map());

  // Track if initial invoice load has completed (to avoid flashing on refresh)
  const initialInvoiceLoadDoneRef = useRef(false);

  const [refreshing, setRefreshing] = useState(false);

  // AI Analysis availability state (managed separately for imperative refresh)
  const [canAnalyze, setCanAnalyze] = useState(false);

  const {
    files: proplatitFiles,
    loading: proplatitLoading,
    loadFiles: loadProplatitFiles,
    updateItem: updateProplatitItem,
    totalValue: proplatitTotalValue,
    selectedFiles: selectedProplatitFiles,
    pauseWatching,
    resumeWatching,
  } = useReimburseFiles({
    rootPath: config.rootPath,
    primaryCurrency: config.primaryCurrency,
    exchangeRates: config.exchangeRates,
    projectStructure: config.projectStructure,
  });

  const { integrityRestoredCount } = useProjectWatcher();

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
    rulesets: config.rulesets,
  });

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

  const {
    handleGenerateById,
    handlePreview,
    handlePreviewAdhocInvoice,
  } = useInvoiceGeneration({
    config,
    adhocInvoices,
    selectedProplatitFiles,
  });

  const loading = proplatitLoading || lastInvoicedMonthLoading;

  useImperativeHandle(ref, () => ({
    refreshAnalysisAvailability: () => {
      isAnalysisAvailable(config.rootPath).then(setCanAnalyze);
      refreshAnalysisAvailability();
    }
  }));

  useEffect(() => {
    isAnalysisAvailable(config.rootPath).then(setCanAnalyze);
  }, [config.rootPath]);

  const reloadLastInvoicedMonth = useCallback(async () => {
    // Only show loading on initial load (to avoid UI flash on refresh)
    const isInitialLoad = !initialInvoiceLoadDoneRef.current;
    if (isInitialLoad) {
      setLastInvoicedMonthLoading(true);
    }

    const lastAbs = await getLastInvoicedMonthAbs(config.rootPath, config.projectStructure);
    setLastInvoicedMonthAbs(lastAbs);

    initialInvoiceLoadDoneRef.current = true;
    setLastInvoicedMonthLoading(false);
  }, [config.rootPath, config.projectStructure, setLastInvoicedMonthAbs, setLastInvoicedMonthLoading]);

  const handleRefresh = useCallback(async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await Promise.all([
        reloadLastInvoicedMonth(),
        loadProplatitFiles()
      ]);
    } finally {
      setRefreshing(false);
    }
  }, [refreshing, loadProplatitFiles, reloadLastInvoicedMonth]);

  useEffect(() => {
    reloadLastInvoicedMonth();
  }, [reloadLastInvoicedMonth]);

  useEffect(() => {
    if (integrityRestoredCount > 0) {
      console.log('Generator: Integrity restored, reloading invoices and extra items');
      reloadLastInvoicedMonth();
      loadProplatitFiles(true);
    }
  }, [integrityRestoredCount, reloadLastInvoicedMonth, loadProplatitFiles]);

  // Wipe transient generator state when this component unmounts (project switch /
  // navigation away). Without this, reopening would re-hydrate from a stale store.
  useEffect(() => {
    return () => {
      resetGeneratorState();
    };
  }, [resetGeneratorState]);

  const baseDrafts = useBaseDrafts({
    config,
    currentDate,
    lastInvoicedMonthAbs,
    lastInvoicedMonthLoading,
    totalOverrides,
    calculatedTotalsRef,
    computedBaseTotalsRef,
  });

  // Apply extra value (proplatit/reimburse files only) to base drafts and push
  // the result through the store. Adhoc invoices are kept entirely separate
  // from the salary-based drafts — they have their own list, preview and
  // generation path, so folding their value into the last month's draft would
  // both double-count them in the header total AND spuriously re-split the
  // regular drafts past maxValue. They are added to the grand total directly
  // in totalDraftValue below.
  useEffect(() => {
    if (proplatitLoading || lastInvoicedMonthLoading) return;

    const draftsWithExtra = applyExtraValueToDrafts(baseDrafts, proplatitTotalValue, config);

    mergeBaseDrafts(draftsWithExtra);
  }, [baseDrafts, proplatitTotalValue, proplatitLoading, lastInvoicedMonthLoading, config, mergeBaseDrafts]);

  const handleGenerateAllComplete = useCallback(async () => {
    clearUserEdits();
    clearAdhocInvoices();
    clearOverrides();
    await Promise.all([
      loadProplatitFiles(),
      reloadLastInvoicedMonth()
    ]);
    resumeWatching();
  }, [clearAdhocInvoices, loadProplatitFiles, reloadLastInvoicedMonth, resumeWatching, clearOverrides, clearUserEdits]);

  const buildInvoiceSnapshots = useCallback(() => {
    // Read drafts non-reactively — this callback only runs when the user
    // opens the Generate All modal, so subscribing here would be wasteful.
    const drafts = useGeneratorStore.getState().drafts;

    // Sort regular drafts chronologically (year, month) with a stable
    // (rulesetId, index) tiebreak — same key the card list uses so the modal
    // mirrors what the user sees on screen.
    const sortedRegular = drafts
      .filter(d => d.status !== 'done')
      .slice()
      .sort((a, b) => {
        const aAbs = a.year * 12 + (a.month - 1);
        const bAbs = b.year * 12 + (b.month - 1);
        if (aAbs !== bAbs) return aAbs - bAbs;
        if (a.rulesetId !== b.rulesetId) return a.rulesetId.localeCompare(b.rulesetId);
        return a.index - b.index;
      });

    const regularEntries = sortedRegular.map(d => {
      const customer = findCustomerForDraft(d, config);
      const ruleset = config.rulesets.find(r => r.id === d.rulesetId);
      const dueDateOffsetDays = ruleset?.dueDateOffsetDays ?? 14;

      let day = 1;
      if (d.invoiceNoOverride.length === 8) {
        day = parseInt(d.invoiceNoOverride.substring(0, 2));
      }
      const issueDate = new Date(d.year, d.month - 1, day);
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + dueDateOffsetDays);

      return {
        snapshot: {
          id: d.id,
          label: d.label,
          amount: d.amount,
          customerId: customer?.id,
          invoiceNo: d.invoiceNoOverride,
          issueDate: `${issueDate.getDate()}. ${issueDate.getMonth() + 1}. ${issueDate.getFullYear()}`,
          dueDate: `${dueDate.getDate()}. ${dueDate.getMonth() + 1}. ${dueDate.getFullYear()}`,
          description: d.description,
        },
        sortKey: d.year * 12 + (d.month - 1),
        kind: 0, // regular drafts win ties against adhocs in the same month
      };
    });

    const sortedAdhocs = adhocInvoices
      .slice()
      .sort((a, b) => new Date(a.issueDate).getTime() - new Date(b.issueDate).getTime());

    // Expand each adhoc into one snapshot per part. Unsplit adhocs keep the
    // bare `adhoc:${id}` id for back-compat; split adhocs use `adhoc:${id}#partK`
    // so handleGenerateById can route to the right part.
    const adhocEntries = sortedAdhocs.flatMap(inv => {
      const issueDate = new Date(inv.issueDate);
      const dueDate = new Date(inv.dueDate);
      const issueDateStr = `${issueDate.getDate()}. ${issueDate.getMonth() + 1}. ${issueDate.getFullYear()}`;
      const dueDateStr = `${dueDate.getDate()}. ${dueDate.getMonth() + 1}. ${dueDate.getFullYear()}`;
      const sortKey = issueDate.getFullYear() * 12 + issueDate.getMonth();

      return getAdhocInvoiceParts(inv, config).map(part => ({
        snapshot: {
          id: part.isSplit
            ? `adhoc:${inv.id}#part${part.partIndex}`
            : `adhoc:${inv.id}`,
          label: part.label,
          amount: part.amount,
          customerId: inv.customerId,
          invoiceNo: part.invoiceNo,
          issueDate: issueDateStr,
          dueDate: dueDateStr,
          description: inv.description,
        },
        sortKey,
        kind: 1,
      }));
    });

    // Stable-sort the combined list. JS Array.sort is stable since ES2019,
    // so equal sortKey+kind items retain their group's pre-sorted order.
    const combined = [...regularEntries, ...adhocEntries].sort(
      (a, b) => a.sortKey - b.sortKey || a.kind - b.kind
    );

    return combined.map(e => e.snapshot);
  }, [adhocInvoices, config]);

  const buildExtraFilesSnapshots = useCallback(() => {
    return selectedProplatitFiles.map(item => ({
      path: item.file.path.replace(/proplatit([\\\/])/i, 'proplaceno$1'),
      name: item.file.name
    }));
  }, [selectedProplatitFiles]);

  const openGenerateAllModal = useCallback(async () => {
    pauseWatching();
    await modal.open(GenerateAllModalComponent, {
      config,
      invoices: buildInvoiceSnapshots(),
      extraFiles: buildExtraFilesSnapshots(),
      primaryCurrency: config.primaryCurrency,
      rootPath: config.rootPath,
      onGenerateInvoice: handleGenerateById,
      onComplete: handleGenerateAllComplete,
    });
  }, [config, buildInvoiceSnapshots, buildExtraFilesSnapshots, handleGenerateById, handleGenerateAllComplete, pauseWatching]);

  const totalDraftValue = draftsTotal + adhocTotal;
  const hasActiveInvoices = draftCount > 0 || adhocInvoices.length > 0;
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
          invoiceCount={draftCount + adhocInvoices.length}
          totalValue={totalDraftValue}
          primaryCurrency={config.primaryCurrency}
          refreshing={refreshing}
          loading={loading}
          onRefresh={handleRefresh}
          onAddAdhoc={openAddAdhocModal}
          onGenerateAll={openGenerateAllModal}
        />

        <BillingPeriodBadge />

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
          rootPath={config.rootPath}
          projectStructure={config.projectStructure}
        />

        <AdhocInvoicesList
          invoices={adhocInvoices}
          primaryCurrency={config.primaryCurrency}
          config={config}
          onPreview={handlePreviewAdhocInvoice}
          onEdit={openEditAdhocModal}
          onRemove={handleRemoveAdhocInvoice}
        />

        <div className="space-y-4">
          {!hasActiveInvoices && <EmptyState />}

          {sortedIds.map(id => (
            <InvoiceDraftCard
              key={id}
              draftId={id}
              config={config}
              computedBaseTotals={computedBaseTotalsRef.current}
              onPreview={handlePreview}
            />
          ))}
        </div>
      </>
      )}
    </div>
  );
});

export default Generator;
