import { useState, useCallback, useEffect, useMemo, type SetStateAction } from 'react';
import { AdhocInvoice } from './types';
import { AdhocInvoiceModal } from '../modals/AdhocInvoiceModal';
import { CompanyDetails, Ruleset } from '../../types';
import { normalizeAdhocVariableSymbol } from './adhocSplit';

export interface UseAdhocInvoicesProps {
  companies: CompanyDetails[];
  primaryCurrency: string;
  rulesets: Ruleset[];
  rootPath: string;
}

export interface UseAdhocInvoicesReturn {
  adhocInvoices: AdhocInvoice[];
  openAddAdhocModal: () => Promise<void>;
  openEditAdhocModal: (invoice: AdhocInvoice) => Promise<void>;
  handleRemoveAdhocInvoice: (id: string) => void;
  clearAdhocInvoices: () => void;
  adhocTotal: number;
}

const ADHOC_STORAGE_VERSION = 1;
const ADHOC_STORAGE_PREFIX = 'pig_adhoc_invoices:';

interface StoredAdhocInvoices {
  version: number;
  invoices: AdhocInvoice[];
}

function getAdhocStorageKey(rootPath: string): string {
  return `${ADHOC_STORAGE_PREFIX}${rootPath.trim().toLowerCase()}`;
}

function loadAdhocInvoices(storageKey: string): AdhocInvoice[] {
  try {
    const stored = localStorage.getItem(storageKey);
    if (!stored) return [];

    const parsed = JSON.parse(stored) as StoredAdhocInvoices | AdhocInvoice[];
    const invoices = Array.isArray(parsed) ? parsed : parsed.invoices;
    if (!Array.isArray(invoices)) return [];

    return invoices
      .filter(invoice => invoice && typeof invoice.id === 'string')
      .map(invoice => ({
        ...invoice,
        variableSymbol: normalizeAdhocVariableSymbol(invoice.variableSymbol || '', invoice.invoiceNo || ''),
      }));
  } catch (error) {
    console.warn('Failed to load persisted ad hoc invoices:', error);
    return [];
  }
}

function persistAdhocInvoices(storageKey: string, invoices: AdhocInvoice[]): void {
  try {
    const stored: StoredAdhocInvoices = {
      version: ADHOC_STORAGE_VERSION,
      invoices,
    };
    localStorage.setItem(storageKey, JSON.stringify(stored));
  } catch (error) {
    console.error('Failed to persist ad hoc invoices:', error);
  }
}

export function useAdhocInvoices({
  companies,
  primaryCurrency,
  rulesets,
  rootPath,
}: UseAdhocInvoicesProps): UseAdhocInvoicesReturn {
  const storageKey = useMemo(() => getAdhocStorageKey(rootPath), [rootPath]);
  const [adhocInvoices, setAdhocInvoices] = useState<AdhocInvoice[]>(() =>
    loadAdhocInvoices(storageKey)
  );

  useEffect(() => {
    setAdhocInvoices(loadAdhocInvoices(storageKey));
  }, [storageKey]);

  const updateAdhocInvoices = useCallback((update: SetStateAction<AdhocInvoice[]>) => {
    setAdhocInvoices(previous => {
      const next = typeof update === 'function' ? update(previous) : update;
      persistAdhocInvoices(storageKey, next);
      return next;
    });
  }, [storageKey]);

  const openAddAdhocModal = useCallback(async () => {
    const result = await AdhocInvoiceModal.create({ companies, primaryCurrency, rulesets });
    if (result) {
      const newInvoice: AdhocInvoice = {
        ...result,
        id: `adhoc-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
      };
      updateAdhocInvoices(prev => [...prev, newInvoice]);
    }
  }, [companies, primaryCurrency, rulesets, updateAdhocInvoices]);

  const openEditAdhocModal = useCallback(async (invoice: AdhocInvoice) => {
    const result = await AdhocInvoiceModal.edit({ companies, primaryCurrency, rulesets, invoice });
    if (result) {
      updateAdhocInvoices(prev => prev.map(inv =>
        inv.id === invoice.id ? { ...result, id: invoice.id } : inv
      ));
    }
  }, [companies, primaryCurrency, rulesets, updateAdhocInvoices]);

  const handleRemoveAdhocInvoice = useCallback((id: string) => {
    updateAdhocInvoices(prev => prev.filter(inv => inv.id !== id));
  }, [updateAdhocInvoices]);

  const clearAdhocInvoices = useCallback(() => {
    updateAdhocInvoices([]);
  }, [updateAdhocInvoices]);

  const adhocTotal = adhocInvoices.reduce((sum, inv) => sum + inv.value, 0);

  return {
    adhocInvoices,
    openAddAdhocModal,
    openEditAdhocModal,
    handleRemoveAdhocInvoice,
    clearAdhocInvoices,
    adhocTotal,
  };
}
