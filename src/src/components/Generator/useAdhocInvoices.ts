import { useState, useCallback } from 'react';
import { AdhocInvoice } from './types';
import { useAdhocInvoiceModal } from '../../contexts/AdhocInvoiceModalContext';
import { CompanyDetails } from '../../types';

export interface UseAdhocInvoicesProps {
  companies: CompanyDetails[];
  primaryCurrency: string;
}

export interface UseAdhocInvoicesReturn {
  adhocInvoices: AdhocInvoice[];
  openAddAdhocModal: () => Promise<void>;
  openEditAdhocModal: (invoice: AdhocInvoice) => Promise<void>;
  handleRemoveAdhocInvoice: (id: string) => void;
  clearAdhocInvoices: () => void;
  adhocTotal: number;
}

export function useAdhocInvoices({ companies, primaryCurrency }: UseAdhocInvoicesProps): UseAdhocInvoicesReturn {
  const [adhocInvoices, setAdhocInvoices] = useState<AdhocInvoice[]>([]);
  const adhocModal = useAdhocInvoiceModal();

  const openAddAdhocModal = useCallback(async () => {
    const result = await adhocModal.create({ companies, primaryCurrency });
    if (result) {
      const newInvoice: AdhocInvoice = {
        ...result,
        id: `adhoc-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
      };
      setAdhocInvoices(prev => [...prev, newInvoice]);
    }
  }, [adhocModal, companies, primaryCurrency]);

  const openEditAdhocModal = useCallback(async (invoice: AdhocInvoice) => {
    const result = await adhocModal.edit({ companies, primaryCurrency, invoice });
    if (result) {
      setAdhocInvoices(prev => prev.map(inv => 
        inv.id === invoice.id ? { ...result, id: invoice.id } : inv
      ));
    }
  }, [adhocModal, companies, primaryCurrency]);

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
