import { FileText } from 'lucide-react';

export function EmptyState() {
  return (
    <div className="card p-12 flex flex-col items-center justify-center text-center">
      <div
        className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
        style={{ backgroundColor: 'var(--bg-muted)' }}
      >
        <FileText size={32} style={{ color: 'var(--text-muted)' }} />
      </div>
      <p className="text-lg font-medium" style={{ color: 'var(--text-secondary)' }}>
        No pending invoices
      </p>
      <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
        All invoices have been generated or it's too early in the billing period.
      </p>
    </div>
  );
}
