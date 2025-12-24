import { useState, useCallback } from 'react';
import { Config } from '../../types';
import { InvoiceDraft, AdhocInvoice } from './types';
import { findCustomerForDraft } from './utils';

interface SelectedProplatitFile {
  file: { path: string; name: string };
  value: number;
  selected: boolean;
}

interface InvoiceSnapshot {
  id: string;
  label: string;
  amount: number;
  customerId?: string;
  invoiceNo: string;
  issueDate: string;
  dueDate: string;
  description: string;
}

interface ExtraFileSnapshot {
  path: string;
  name: string;
}

export interface UseGenerateAllModalProps {
  config: Config;
  drafts: InvoiceDraft[];
  adhocInvoices: AdhocInvoice[];
  selectedProplatitFiles: SelectedProplatitFile[];
}

export interface UseGenerateAllModalReturn {
  generateAllModalOpen: boolean;
  generateAllInvoicesSnapshot: InvoiceSnapshot[];
  generateAllExtraFilesSnapshot: ExtraFileSnapshot[];
  openGenerateAllModal: () => void;
  closeGenerateAllModal: () => void;
}

export function useGenerateAllModal({
  config,
  drafts,
  adhocInvoices,
  selectedProplatitFiles,
}: UseGenerateAllModalProps): UseGenerateAllModalReturn {
  const [generateAllModalOpen, setGenerateAllModalOpen] = useState(false);
  const [generateAllInvoicesSnapshot, setGenerateAllInvoicesSnapshot] = useState<InvoiceSnapshot[]>([]);
  const [generateAllExtraFilesSnapshot, setGenerateAllExtraFilesSnapshot] = useState<ExtraFileSnapshot[]>([]);

  const openGenerateAllModal = useCallback(() => {
    // Freeze the invoices list for the whole modal session so parent re-renders (sync)
    // can't cause the modal to suddenly show "0 of 0".
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
    
    setGenerateAllInvoicesSnapshot([...regularDrafts, ...adhocDrafts]);
    // Snapshot extra files with DESTINATION paths (files will be moved from proplatit to proplaceno)
    setGenerateAllExtraFilesSnapshot(
      selectedProplatitFiles.map(item => ({
        // Replace 'proplatit' with 'proplaceno' in the path since files get moved during generation
        path: item.file.path.replace(/proplatit([\\\/])/i, 'proplaceno$1'),
        name: item.file.name
      }))
    );
    setGenerateAllModalOpen(true);
  }, [drafts, adhocInvoices, selectedProplatitFiles, config]);

  const closeGenerateAllModal = useCallback(() => {
    setGenerateAllModalOpen(false);
    setGenerateAllInvoicesSnapshot([]);
    setGenerateAllExtraFilesSnapshot([]);
  }, []);

  return {
    generateAllModalOpen,
    generateAllInvoicesSnapshot,
    generateAllExtraFilesSnapshot,
    openGenerateAllModal,
    closeGenerateAllModal,
  };
}
