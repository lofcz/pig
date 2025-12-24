import { Calendar } from 'lucide-react';
import { InvoiceDraft } from './types';

interface BillingPeriodBadgeProps {
  drafts: InvoiceDraft[];
}

export function BillingPeriodBadge({ drafts }: BillingPeriodBadgeProps) {
  if (drafts.length === 0) return null;

  const uniquePeriods = Array.from(new Set(drafts.map(d => d.periodLabel)));

  return (
    <div 
      className="card mb-6 px-5 py-4 flex items-center gap-3"
      style={{ borderLeft: '4px solid var(--accent-500)' }}
    >
      <div 
        className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
        style={{ backgroundColor: 'var(--accent-100)' }}
      >
        <Calendar size={16} style={{ color: 'var(--accent-600)' }} />
      </div>
      <div>
        <span className="text-sm font-medium" style={{ color: 'var(--text-muted)' }}>
          Billing Periods:
        </span>
        <span className="ml-2 font-semibold" style={{ color: 'var(--text-primary)' }}>
          {uniquePeriods.join(', ')}
        </span>
      </div>
    </div>
  );
}
