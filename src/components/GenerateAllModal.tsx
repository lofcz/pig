import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { openPath } from '@tauri-apps/plugin-opener';
import { 
  Sparkles, 
  CheckCircle2, 
  Loader2, 
  FolderOpen, 
  FileText, 
  X,
  ExternalLink,
  PartyPopper
} from 'lucide-react';
import { useEventListener } from '../hooks';

import { Currency } from '../types';

interface GeneratedInvoice {
  id: string;
  label: string;
  amount: number;
  pdfPath: string;
}

interface InvoiceToGenerate {
  id: string;
  label: string;
  amount: number;
}

interface GenerateAllModalProps {
  isOpen: boolean;
  onClose: () => void;
  invoices: InvoiceToGenerate[];
  primaryCurrency: Currency;
  onGenerateInvoice: (id: string) => Promise<string | undefined>;
  rootPath: string;
  onComplete: () => Promise<void>;
}

type ModalPhase = 'generating' | 'complete';

interface InvoiceStatus {
  id: string;
  status: 'pending' | 'generating' | 'done' | 'error';
  pdfPath?: string;
  justFinished?: boolean; // Track if item just completed for fadeout animation
}

export default function GenerateAllModal({
  isOpen,
  onClose,
  invoices,
  primaryCurrency,
  onGenerateInvoice,
  rootPath,
  onComplete
}: GenerateAllModalProps) {
  const [phase, setPhase] = useState<ModalPhase>('generating');
  const [statuses, setStatuses] = useState<InvoiceStatus[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [fakeProgress, setFakeProgress] = useState(0);
  const [generatedInvoices, setGeneratedInvoices] = useState<GeneratedInvoice[]>([]);
  const [hasSynced, setHasSynced] = useState(false);

  // Freeze the invoices list for the whole open session (parent re-renders during sync
  // must not change what the modal is showing).
  const [sessionInvoices, setSessionInvoices] = useState<InvoiceToGenerate[]>([]);

  useEffect(() => {
    if (!isOpen) {
      // Reset immediately when closed
      setSessionInvoices([]);
      setHasSynced(false);
      setPhase('generating');
      setCurrentIndex(0);
      setFakeProgress(0);
      setGeneratedInvoices([]);
      setStatuses([]);
      return;
    }

    // On open: capture a deep copy ONCE for this session
    const copiedInvoices = invoices.map(inv => ({
      id: inv.id,
      label: inv.label,
      amount: inv.amount
    }));
    setSessionInvoices(copiedInvoices);
    setPhase('generating');
    setCurrentIndex(0);
    setFakeProgress(0);
    setGeneratedInvoices([]);
    setHasSynced(false);
    setStatuses(copiedInvoices.map(inv => ({ id: inv.id, status: 'pending' })));
    // We intentionally depend only on isOpen so we don't reinitialize when parent re-renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Main generation loop - uses sessionInvoices to prevent issues with prop changes
  useEffect(() => {
    if (!isOpen || phase !== 'generating' || sessionInvoices.length === 0) return;
    if (currentIndex >= sessionInvoices.length) {
      // All done!
      setFakeProgress(100);
      setTimeout(() => setPhase('complete'), 500);
      return;
    }

    const generateCurrent = async () => {
      const invoice = sessionInvoices[currentIndex];
      
      // Mark as generating
      setStatuses(prev => prev.map(s => 
        s.id === invoice.id ? { ...s, status: 'generating' } : s
      ));

      try {
        const pdfPath = await onGenerateInvoice(invoice.id);
        
        // Mark as done with justFinished flag for animation
        setStatuses(prev => prev.map(s => 
          s.id === invoice.id ? { ...s, status: 'done', pdfPath, justFinished: true } : s
        ));

        // Clear justFinished flag after animation completes (1.3s - slightly longer than 1.2s animation)
        setTimeout(() => {
          setStatuses(prev => prev.map(s => 
            s.id === invoice.id ? { ...s, justFinished: false } : s
          ));
        }, 1300);

        if (pdfPath) {
          setGeneratedInvoices(prev => [...prev, {
            id: invoice.id,
            label: invoice.label,
            amount: invoice.amount,
            pdfPath
          }]);
        }

        // Move to next
        setCurrentIndex(prev => prev + 1);
      } catch (error) {
        console.error('Generation error:', error);
        setStatuses(prev => prev.map(s => 
          s.id === invoice.id ? { ...s, status: 'error' } : s
        ));
        setCurrentIndex(prev => prev + 1);
      }
    };

    // Small delay for visual effect
    const timer = setTimeout(generateCurrent, 300);
    return () => clearTimeout(timer);
  }, [isOpen, phase, currentIndex, sessionInvoices, onGenerateInvoice]);

  // Fake progress animation - smooth progression based on completed items
  useEffect(() => {
    if (!isOpen || phase !== 'generating' || sessionInvoices.length === 0) return;

    // Calculate target based on completed count for smoother progression
    const completedCount = statuses.filter(s => s.status === 'done').length;
    const generatingCount = statuses.filter(s => s.status === 'generating').length;
    
    // Base progress on completed + partial progress for current generating item
    const baseProgress = (completedCount / sessionInvoices.length) * 100;
    const partialProgress = generatingCount > 0 ? (0.5 / sessionInvoices.length) * 100 : 0;
    const targetProgress = Math.min(95, baseProgress + partialProgress);

    const interval = setInterval(() => {
      setFakeProgress(prev => {
        if (prev >= targetProgress) return prev;
        const step = Math.max(0.3, (targetProgress - prev) * 0.08);
        return Math.min(targetProgress, prev + step);
      });
    }, 30);

    return () => clearInterval(interval);
  }, [isOpen, phase, statuses, sessionInvoices.length]);

  // Sync data when entering complete phase (before user sees it, to avoid flash on close)
  useEffect(() => {
    if (phase === 'complete' && !hasSynced) {
      setHasSynced(true);
      onComplete();
    }
  }, [phase, hasSynced]); // eslint-disable-line react-hooks/exhaustive-deps

  // Disable body scroll
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = '';
      };
    }
  }, [isOpen]);

  // Keyboard handler - only allow close in complete phase
  useEventListener({
    type: 'keydown',
    handler: useCallback((e: KeyboardEvent) => {
      if (e.key === 'Escape' && phase === 'complete') {
        handleClose();
      }
    }, [phase]),
    enabled: isOpen
  });

  const handleClose = () => {
    // Sync again on close for safety (but don't spam if we already synced on completion)
    if (!hasSynced) {
      onComplete();
    }
    onClose();
  };

  const handleOpenFile = async (path: string) => {
    try {
      await openPath(path);
    } catch (e) {
      console.error('Failed to open file:', e);
    }
  };

  const handleOpenFolder = async () => {
    try {
      // Get the year folder from the first generated invoice
      if (generatedInvoices.length > 0) {
        const firstPath = generatedInvoices[0].pdfPath;
        const folderPath = firstPath.substring(0, firstPath.lastIndexOf('\\'));
        await openPath(folderPath);
      } else {
        await openPath(rootPath);
      }
    } catch (e) {
      console.error('Failed to open folder:', e);
    }
  };

  if (!isOpen) return null;

  const completedCount = statuses.filter(s => s.status === 'done').length;
  const totalCount = sessionInvoices.length;
  const totalAmount = generatedInvoices.reduce((sum, inv) => sum + inv.amount, 0);

  return createPortal(
    <div className="generate-all-overlay">
      <div className="generate-all-backdrop" />
      
      <div className="generate-all-content">
        {phase === 'generating' ? (
          // GENERATING PHASE
          <div className="generate-all-generating">
            {/* Header */}
            <div className="generate-all-header">
              <div className="generate-all-icon-wrapper generating">
                <Sparkles size={32} className="generate-all-icon" />
              </div>
              <h2 className="generate-all-title">Generating Invoices</h2>
              <p className="generate-all-subtitle">
                {completedCount} of {totalCount} completed
              </p>
            </div>

            {/* Progress Bar */}
            <div className="generate-all-progress-container">
              <div className="generate-all-progress-track">
                <div 
                  className="generate-all-progress-bar"
                  style={{ width: `${fakeProgress}%` }}
                />
                <div 
                  className="generate-all-progress-glow"
                  style={{ left: `${fakeProgress}%` }}
                />
              </div>
              <span className="generate-all-progress-text">
                {Math.round(fakeProgress)}%
              </span>
            </div>

            {/* Invoice List */}
            <div className="generate-all-list">
              {sessionInvoices.map((invoice, idx) => {
                const status = statuses.find(s => s.id === invoice.id);
                const isActive = status?.status === 'generating';
                const isDone = status?.status === 'done';
                const isError = status?.status === 'error';
                const justFinished = status?.justFinished ?? false;

                return (
                  <div 
                    key={invoice.id}
                    className={`generate-all-item ${isDone ? 'done' : ''} ${isActive ? 'active' : ''} ${isError ? 'error' : ''} ${justFinished ? 'finished' : ''}`}
                  >
                    <div className="generate-all-item-status">
                      {isDone ? (
                        <CheckCircle2 size={20} className="status-icon done" />
                      ) : isActive ? (
                        <Loader2 size={20} className="status-icon active animate-spin" />
                      ) : isError ? (
                        <X size={20} className="status-icon error" />
                      ) : (
                        <div className="status-dot" />
                      )}
                    </div>
                    <div className="generate-all-item-content">
                      <span className="generate-all-item-label">{invoice.label}</span>
                      <span className="generate-all-item-amount">
                        {invoice.amount.toLocaleString()} {primaryCurrency}
                      </span>
                    </div>
                    {isDone && (
                      <div className="generate-all-item-checkmark">
                        <div className="checkmark-circle" />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          // COMPLETE PHASE
          <div className="generate-all-complete">
            {/* Success Header */}
            <div className="generate-all-header success">
              <div className="generate-all-icon-wrapper success">
                <PartyPopper size={36} className="generate-all-icon" />
              </div>
              <h2 className="generate-all-title">All Done!</h2>
              <p className="generate-all-subtitle">
                {generatedInvoices.length} invoice{generatedInvoices.length !== 1 ? 's' : ''} generated successfully
              </p>
            </div>

            {/* Total Summary */}
            <div className="generate-all-summary">
              <div className="generate-all-summary-item">
                <span className="summary-label">Total Value</span>
                <span className="summary-value">{totalAmount.toLocaleString()} {primaryCurrency}</span>
              </div>
            </div>

            {/* Generated Files List */}
            <div className="generate-all-files">
              <h3 className="generate-all-files-title">Generated Files</h3>
              <div className="generate-all-files-list">
                {generatedInvoices.map((inv, idx) => (
                  <button
                    key={inv.id}
                    onClick={() => handleOpenFile(inv.pdfPath)}
                    className="generate-all-file-item"
                    style={{ animationDelay: `${idx * 80}ms` }}
                  >
                    <FileText size={18} className="file-icon" />
                    <div className="file-info">
                      <span className="file-label">{inv.label}</span>
                      <span className="file-amount">{inv.amount.toLocaleString()} {primaryCurrency}</span>
                    </div>
                    <ExternalLink size={16} className="file-external" />
                  </button>
                ))}
              </div>
            </div>

            {/* Actions */}
            <div className="generate-all-actions">
              <button 
                onClick={handleOpenFolder}
                className="btn btn-secondary generate-all-btn"
              >
                <FolderOpen size={18} />
                <span>Open Folder</span>
              </button>
              <button 
                onClick={handleClose}
                className="btn btn-success generate-all-btn"
              >
                <CheckCircle2 size={18} />
                <span>Done</span>
              </button>
            </div>

            {/* Keyboard hint */}
            <p className="generate-all-hint">
              Press <kbd>Esc</kbd> to close
            </p>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

