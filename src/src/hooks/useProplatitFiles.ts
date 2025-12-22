import { useState, useEffect, useMemo, useCallback } from 'react';
import { getProplatitFiles, FileEntry } from '../utils/logic';
import { Config, Currency } from '../types';

export interface ProplatitItem {
  file: FileEntry;
  value: number;
  currency: Currency;
  selected: boolean;
  assignedDraftId?: string;
}

interface UseProplatitFilesOptions {
  rootPath: string;
  primaryCurrency: Currency;
  exchangeRates: Config['exchangeRates'];
}

/**
 * Hook for managing proplatit (extra) files state.
 */
export function useProplatitFiles({ rootPath, primaryCurrency, exchangeRates }: UseProplatitFilesOptions) {
  const [files, setFiles] = useState<ProplatitItem[]>([]);
  const [loading, setLoading] = useState(true);

  const loadFiles = useCallback(async () => {
    setLoading(true);
    const loadedFiles = await getProplatitFiles(rootPath);
    setFiles(loadedFiles.map(f => ({
      file: f,
      value: 0,
      currency: primaryCurrency,
      selected: false,
      assignedDraftId: undefined
    })));
    setLoading(false);
  }, [rootPath, primaryCurrency]);

  useEffect(() => {
    loadFiles();
  }, [loadFiles]);

  const updateItem = useCallback((
    index: number,
    value: number,
    currency: Currency,
    selected: boolean
  ) => {
    setFiles(prev => prev.map((item, idx) =>
      idx === index ? { ...item, value, currency, selected } : item
    ));
  }, []);

  const totalValue = useMemo(() => {
    return files.filter(p => p.selected).reduce((sum, p) => {
      let val = p.value;
      // Convert from item's currency to primary currency
      if (p.currency !== primaryCurrency) {
        // First convert to the base (using exchange rate), then account for primary currency rate
        val = val * exchangeRates[p.currency] / exchangeRates[primaryCurrency];
      }
      return sum + val;
    }, 0);
  }, [files, exchangeRates, primaryCurrency]);

  const selectedFiles = useMemo(() => 
    files.filter(p => p.selected),
    [files]
  );

  return {
    files,
    setFiles,
    loading,
    loadFiles,
    updateItem,
    totalValue,
    selectedFiles
  };
}

