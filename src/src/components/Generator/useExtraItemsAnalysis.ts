import { useState, useCallback } from 'react';
import { toast } from 'sonner';
import { analyzeExtraItems, isAnalysisAvailable, AnalysisProgress } from '../../utils/analyzeExtraItems';
import { Currency } from '../../types';

interface ExtraItem {
  file: { path: string; name: string };
  value: number;
  selected: boolean;
}

export interface UseExtraItemsAnalysisProps {
  rootPath: string;
  primaryCurrency: Currency;
  items: ExtraItem[];
  updateItem: (index: number, value: number, currency: Currency, selected: boolean) => void;
}

export interface UseExtraItemsAnalysisReturn {
  analyzing: boolean;
  analysisProgress: AnalysisProgress | null;
  canAnalyze: boolean;
  analyzingIndices: Set<number>;
  refreshAnalysisAvailability: () => void;
  handleAnalyzeExtraItems: () => Promise<void>;
}

export function useExtraItemsAnalysis({
  rootPath,
  primaryCurrency,
  items,
  updateItem,
}: UseExtraItemsAnalysisProps): UseExtraItemsAnalysisReturn {
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState<AnalysisProgress | null>(null);
  const [canAnalyze, setCanAnalyze] = useState(false);
  const [analyzingIndices, setAnalyzingIndices] = useState<Set<number>>(new Set());

  const refreshAnalysisAvailability = useCallback(() => {
    isAnalysisAvailable(rootPath).then(setCanAnalyze);
  }, [rootPath]);

  const handleAnalyzeExtraItems = useCallback(async () => {
    if (analyzing || items.length === 0) return;

    setAnalyzing(true);

    try {
      // Only analyze items that don't have a value yet (0 or empty)
      const itemsToAnalyze = items
        .map((item, index) => ({
          filePath: item.file.path,
          fileName: item.file.name,
          index,
          value: item.value,
        }))
        .filter(item => !item.value || item.value === 0);

      if (itemsToAnalyze.length === 0) {
        toast.info('All items already have values');
        setAnalyzing(false);
        return;
      }

      setAnalysisProgress({ completed: 0, total: itemsToAnalyze.length });
      
      // Mark only filtered items as analyzing
      const itemIndices = new Set(itemsToAnalyze.map(item => item.index));
      setAnalyzingIndices(itemIndices);

      let successCount = 0;
      let errorCount = 0;

      await analyzeExtraItems(itemsToAnalyze, {
        rootPath,
        primaryCurrency,
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
            updateItem(
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
  }, [analyzing, items, updateItem, rootPath, primaryCurrency]);

  return {
    analyzing,
    analysisProgress,
    canAnalyze,
    analyzingIndices,
    refreshAnalysisAvailability,
    handleAnalyzeExtraItems,
  };
}
