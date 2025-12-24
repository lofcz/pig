import NumberFlow from '@number-flow/react';
import { 
  Plus, 
  Eye,
  Pencil, 
  Trash2 
} from 'lucide-react';
import { AdhocInvoice } from './types';

interface AdhocInvoicesListProps {
  invoices: AdhocInvoice[];
  primaryCurrency: string;
  onPreview: (invoice: AdhocInvoice) => void;
  onEdit: (invoice: AdhocInvoice) => void;
  onRemove: (id: string) => void;
}

export function AdhocInvoicesList({ 
  invoices, 
  primaryCurrency, 
  onPreview, 
  onEdit, 
  onRemove 
}: AdhocInvoicesListProps) {
  const totalValue = invoices.reduce((sum, inv) => sum + inv.value, 0);

  if (invoices.length === 0) return null;

  return (
    <div className="card mb-8 overflow-hidden">
      <div 
        className="px-5 py-4 flex items-center justify-between"
        style={{ 
          backgroundColor: 'var(--bg-muted)',
          borderBottom: '1px solid var(--border-default)'
        }}
      >
        <div className="flex items-center gap-3">
          <div 
            className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: 'var(--accent-100)' }}
          >
            <Plus size={16} style={{ color: 'var(--accent-600)' }} />
          </div>
          <h3 className="font-semibold" style={{ color: 'var(--text-primary)' }}>
            Adhoc Invoices
          </h3>
          <span className="badge badge-primary">
            {invoices.length}
          </span>
        </div>
        <div 
          className="text-lg font-bold font-mono"
          style={{ color: 'var(--accent-600)' }}
        >
          <NumberFlow 
            value={totalValue} 
            format={{ useGrouping: true }}
            suffix={` ${primaryCurrency}`}
          />
        </div>
      </div>
      
      <div className="divide-y" style={{ borderColor: 'var(--border-default)' }}>
        {invoices.map(invoice => (
          <div key={invoice.id} className="px-5 py-4 flex items-center justify-between">
            <div className="flex-1">
              <button
                onClick={() => onPreview(invoice)}
                className="group flex items-center gap-3 mb-1 cursor-pointer"
              >
                <span 
                  className="font-semibold group-hover:underline" 
                  style={{ color: 'var(--accent-600)' }}
                >
                  {invoice.name}
                </span>
                <span className="text-sm font-mono" style={{ color: 'var(--text-muted)' }}>
                  #{invoice.invoiceNo}
                </span>
                <Eye 
                  size={14} 
                  className="opacity-0 group-hover:opacity-100 transition-opacity" 
                  style={{ color: 'var(--text-muted)' }}
                />
              </button>
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                {invoice.description}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className="font-bold font-mono" style={{ color: 'var(--text-primary)' }}>
                {invoice.value.toLocaleString()} {primaryCurrency}
              </span>
              <button
                onClick={() => onEdit(invoice)}
                className="p-2 rounded-lg transition-colors hover:bg-black/5 dark:hover:bg-white/10"
                style={{ color: 'var(--text-muted)' }}
                title="Edit invoice"
              >
                <Pencil size={16} />
              </button>
              <button
                onClick={() => onRemove(invoice.id)}
                className="p-2 rounded-lg transition-colors hover:bg-red-500/10"
                style={{ color: 'var(--error-500)' }}
                title="Remove invoice"
              >
                <Trash2 size={16} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
