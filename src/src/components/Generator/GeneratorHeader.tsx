import NumberFlow from '@number-flow/react';
import { 
  RefreshCw,
  Plus,
  Banknote,
  Sparkles
} from 'lucide-react';
import { CauldronButton } from '../CauldronButton';

interface GeneratorHeaderProps {
  hasActiveInvoices: boolean;
  invoiceCount: number;
  totalValue: number;
  primaryCurrency: string;
  refreshing: boolean;
  loading: boolean;
  onRefresh: () => void;
  onAddAdhoc: () => void;
  onGenerateAll: () => void;
}

export function GeneratorHeader({
  hasActiveInvoices,
  invoiceCount,
  totalValue,
  primaryCurrency,
  refreshing,
  loading,
  onRefresh,
  onAddAdhoc,
  onGenerateAll
}: GeneratorHeaderProps) {
  return (
    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <button
            onClick={onRefresh}
            disabled={refreshing || loading}
            className="btn btn-ghost btn-icon"
            style={{ color: 'var(--text-muted)' }}
            title="Refresh invoices"
          >
            <RefreshCw size={20} className={refreshing ? 'animate-spin' : ''} />
          </button>
          <h2 
            className="text-2xl lg:text-3xl font-bold"
            style={{ color: 'var(--text-primary)' }}
          >
            Pending Invoices
          </h2>
        </div>
        <p 
          className="text-sm"
          style={{ color: 'var(--text-muted)' }}
        >
          {hasActiveInvoices 
            ? `${invoiceCount} invoice${invoiceCount !== 1 ? 's' : ''} ready for generation`
            : 'No pending invoices at this time'
          }
        </p>
      </div>

      <div className="flex items-center gap-3">
        {/* Add Adhoc Invoice Button */}
        <button
          onClick={onAddAdhoc}
          className="btn btn-ghost btn-icon"
          style={{ color: 'var(--text-muted)' }}
          title="Add custom invoice"
        >
          <Plus size={20} />
        </button>

        {invoiceCount > 0 && (
          <>
            {/* Total Summary */}
            <div 
              className="card px-4 py-3 flex items-center gap-3"
              style={{ backgroundColor: 'var(--accent-50)' }}
            >
              <div 
                className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: 'var(--accent-100)' }}
              >
                <Banknote size={20} style={{ color: 'var(--accent-600)' }} />
              </div>
              <div>
                <p className="text-xs font-medium" style={{ color: 'var(--accent-600)' }}>Total Value</p>
                <p className="text-lg font-bold font-mono" style={{ color: 'var(--accent-700)' }}>
                  <NumberFlow 
                    value={totalValue} 
                    format={{ useGrouping: true }}
                    suffix={` ${primaryCurrency}`}
                  />
                </p>
              </div>
            </div>
          </>
        )}

        {/* Generate All Button - show when there are any invoices (regular or adhoc) */}
        {hasActiveInvoices && (
          <CauldronButton onClick={onGenerateAll}>
            <Sparkles size={18} className="flex-shrink-0" />
            <span>Generate All</span>
          </CauldronButton>
        )}
      </div>
    </div>
  );
}
