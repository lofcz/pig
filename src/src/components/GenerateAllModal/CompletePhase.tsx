import { 
  PartyPopper, 
  FolderOpen, 
  FileText, 
  ExternalLink, 
  CheckCircle2,
  Mail,
  ChevronRight
} from 'lucide-react';
import { Currency } from '../../types';
import { GeneratedInvoice } from './types';

interface CompletePhaseProps {
  generatedInvoices: GeneratedInvoice[];
  primaryCurrency: Currency;
  canSendEmails: boolean;
  onOpenFile: (path: string) => void;
  onOpenFolder: () => void;
  onStartEmailFlow: () => void;
  onClose: () => void;
}

export default function CompletePhase({
  generatedInvoices,
  primaryCurrency,
  canSendEmails,
  onOpenFile,
  onOpenFolder,
  onStartEmailFlow,
  onClose,
}: CompletePhaseProps) {
  const totalAmount = generatedInvoices.reduce((sum, inv) => sum + inv.amount, 0);

  return (
    <div className="generate-all-complete">
      <div className="generate-all-header success">
        <div className="generate-all-icon-wrapper success">
          <PartyPopper size={36} className="generate-all-icon" />
        </div>
        <h2 className="generate-all-title">All Done!</h2>
        <p className="generate-all-subtitle">
          {generatedInvoices.length} invoice{generatedInvoices.length !== 1 ? 's' : ''} generated successfully
        </p>
      </div>

      <div className="generate-all-summary">
        <div className="generate-all-summary-item">
          <span className="summary-label">Total Value</span>
          <span className="summary-value">{totalAmount.toLocaleString()} {primaryCurrency}</span>
        </div>
      </div>

      <div className="generate-all-files">
        <h3 className="generate-all-files-title">Generated Files</h3>
        <div className="generate-all-files-list">
          {generatedInvoices.map((inv, idx) => (
            <button
              key={inv.id}
              onClick={() => onOpenFile(inv.pdfPath)}
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

      <div className="generate-all-actions-wrapper">
        {canSendEmails && (
          <button 
            onClick={onStartEmailFlow}
            className="btn btn-primary generate-all-btn-full"
          >
            <Mail size={18} />
            <span>Continue to Send Emails</span>
            <ChevronRight size={16} />
          </button>
        )}
        <div className="generate-all-actions">
          <button 
            onClick={onOpenFolder}
            className="btn btn-secondary generate-all-btn"
          >
            <FolderOpen size={18} />
            <span>Open Folder</span>
          </button>
          <button 
            onClick={onClose}
            className="btn btn-success generate-all-btn"
          >
            <CheckCircle2 size={18} />
            <span>Done</span>
          </button>
        </div>
      </div>

      <p className="generate-all-hint">
        Press <kbd>Esc</kbd> to close
      </p>
    </div>
  );
}
