import { useState, useCallback } from 'react';
import { AdhocInvoice } from './types';
import { AdhocInvoiceModal } from '../modals/AdhocInvoiceModal';
import { CompanyDetails, Ruleset } from '../../types';

export interface UseAdhocInvoicesProps {
  companies: CompanyDetails[];
  primaryCurrency: string;
  rulesets: Ruleset[];
}

export interface UseAdhocInvoicesReturn {
  adhocInvoices: AdhocInvoice[];
  openAddAdhocModal: () => Promise<void>;
  openEditAdhocModal: (invoice: AdhocInvoice) => Promise<void>;
  handleRemoveAdhocInvoice: (id: string) => void;
  clearAdhocInvoices: () => void;
  adhocTotal: number;
}

export function useAdhocInvoices({ companies, primaryCurrency, rulesets }: UseAdhocInvoicesProps): UseAdhocInvoicesReturn {
  const [adhocInvoices, setAdhocInvoices] = useState<AdhocInvoice[]>([]);

  const openAddAdhocModal = useCallback(async () => {
    const result = await AdhocInvoiceModal.create({ companies, primaryCurrency, rulesets });
    if (result) {
      const newInvoice: AdhocInvoice = {
        ...result,
        id: `adhoc-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
      };
      setAdhocInvoices(prev => [...prev, newInvoice]);
    }
  }, [companies, primaryCurrency, rulesets]);

  const openEditAdhocModal = useCallback(async (invoice: AdhocInvoice) => {
    const result = await AdhocInvoiceModal.edit({ companies, primaryCurrency, rulesets, invoice });
    if (result) {
      setAdhocInvoices(prev => prev.map(inv =>
        inv.id === invoice.id ? { ...result, id: invoice.id } : inv
      ));
    }
  }, [companies, primaryCurrency, rulesets]);

  const handleRemoveAdhocInvoice = useCallback((id: string) => {
    setAdhocInvoices(prev => prev.filter(inv => inv.id !== id));
  }, []);

  const clearAdhocInvoices = useCallback(() => {
    setAdhocInvoices([]);
  }, []);

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
