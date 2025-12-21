import { useState, useEffect, useMemo, useCallback } from 'react';
import { getProplatitFiles, FileEntry } from '../utils/logic';
import { Config } from '../types';

export interface ProplatitItem {
  file: FileEntry;
  value: number;
  currency: 'CZK' | 'EUR' | 'USD';
  selected: boolean;
  assignedDraftId?: string;
}

interface UseProplatitFilesOptions {
  rootPath: string;
  exchangeRates: Config['exchangeRates'];
}

/**
 * Hook for managing proplatit (extra) files state.
 */
export function useProplatitFiles({ rootPath, exchangeRates }: UseProplatitFilesOptions) {
  const [files, setFiles] = useState<ProplatitItem[]>([]);
  const [loading, setLoading] = useState(true);

  const loadFiles = useCallback(async () => {
    setLoading(true);
    const loadedFiles = await getProplatitFiles(rootPath);
    setFiles(loadedFiles.map(f => ({
      file: f,
      value: 0,
      currency: 'CZK' as const,
      selected: false,
      assignedDraftId: undefined
    })));
    setLoading(false);
  }, [rootPath]);

  useEffect(() => {
    loadFiles();
  }, [loadFiles]);

  const updateItem = useCallback((
    index: number,
    value: number,
    currency: 'CZK' | 'EUR' | 'USD',
    selected: boolean
  ) => {
    setFiles(prev => prev.map((item, idx) =>
      idx === index ? { ...item, value, currency, selected } : item
    ));
  }, []);

  const totalValue = useMemo(() => {
    return files.filter(p => p.selected).reduce((sum, p) => {
      let val = p.value;
      if (p.currency === 'EUR') val *= exchangeRates.EUR;
      if (p.currency === 'USD') val *= exchangeRates.USD;
      return sum + val;
    }, 0);
  }, [files, exchangeRates]);

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

