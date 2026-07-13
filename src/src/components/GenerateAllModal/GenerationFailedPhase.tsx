import { AlertTriangle, X } from 'lucide-react';
import { InvoiceStatus, InvoiceToGenerate } from './types';

interface GenerationFailedPhaseProps {
  invoices: InvoiceToGenerate[];
  statuses: InvoiceStatus[];
  onClose: () => void;
}

export default function GenerationFailedPhase({
  invoices,
  statuses,
  onClose,
}: GenerationFailedPhaseProps) {
  const failedStatus = statuses.find(status => status.status === 'error');
  const failedInvoice = invoices.find(invoice => invoice.id === failedStatus?.id);
  const completedCount = statuses.filter(status => status.status === 'done').length;

  return (
    <div className="generate-all-complete">
      <div className="generate-all-header">
        <div
          className="generate-all-icon-wrapper"
          style={{ backgroundColor: 'var(--error-100)' }}
        >
          <AlertTriangle size={36} style={{ color: 'var(--error-500)' }} />
        </div>
        <h2 className="generate-all-title">Generation stopped</h2>
        <p className="generate-all-subtitle">
          No draft or ad hoc invoice data was cleared.
        </p>
      </div>

      <div
        className="rounded-xl border p-4"
        style={{
          borderColor: 'var(--error-300)',
          backgroundColor: 'var(--error-50)',
        }}
      >
        <p className="font-semibold" style={{ color: 'var(--error-700)' }}>
          {failedInvoice?.label || 'An invoice'} could not be generated
        </p>
        <p className="mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>
          {failedStatus?.error || 'No PDF was created. Check LibreOffice and the invoice template.'}
        </p>
        {completedCount > 0 && (
          <p className="mt-3 text-xs" style={{ color: 'var(--text-subtle)' }}>
            {completedCount} earlier invoice{completedCount === 1 ? '' : 's'} completed before generation stopped.
          </p>
        )}
      </div>

      <div className="generate-all-actions-wrapper">
        <button onClick={onClose} className="btn btn-secondary generate-all-btn-full">
          <X size={18} />
          <span>Close and fix</span>
        </button>
      </div>
    </div>
  );
}
