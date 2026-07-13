import NumberFlow from '@number-flow/react';
import {
  Plus,
  Eye,
  Pencil,
  Trash2,
  Split
} from 'lucide-react';
import { Config } from '../../types';
import { AdhocInvoice } from './types';
import { getAdhocInvoiceParts } from './adhocSplit';

interface AdhocInvoicesListProps {
  invoices: AdhocInvoice[];
  primaryCurrency: string;
  config: Config;
  onPreview: (invoice: AdhocInvoice, partIndex?: number) => void;
  onEdit: (invoice: AdhocInvoice) => void;
  onRemove: (id: string) => void;
}

export function AdhocInvoicesList({
  invoices,
  primaryCurrency,
  config,
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
            Ad hoc invoices
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

      <div>
        {invoices.map((invoice, invoiceIndex) => {
          const parts = getAdhocInvoiceParts(invoice, config);
          const isSplit = parts.length > 1;
          const parentedRuleset = invoice.rulesetId
            ? config.rulesets.find(r => r.id === invoice.rulesetId)
            : undefined;

          return (
            <div
              key={invoice.id}
              className="px-5 py-5"
              style={{
                borderTop: invoiceIndex > 0 ? '1px solid var(--border-default)' : undefined
              }}
            >
              {/* Parent row */}
              <div className="flex flex-col items-stretch justify-between gap-4 sm:flex-row sm:items-start sm:gap-5">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2.5 mb-1.5">
                    {isSplit ? (
                      <span
                        className="font-semibold truncate"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        {invoice.name}
                      </span>
                    ) : (
                      <button
                        onClick={() => onPreview(invoice, 0)}
                        className="group flex items-center gap-3 cursor-pointer"
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
                    )}
                    {isSplit && (
                      <span className="text-sm font-mono" style={{ color: 'var(--text-muted)' }}>
                        #{invoice.invoiceNo}
                      </span>
                    )}
                    {isSplit && (
                      <span
                        className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full"
                        style={{
                          backgroundColor: 'var(--accent-100)',
                          color: 'var(--accent-700)'
                        }}
                      >
                        <Split size={11} />
                        {parts.length} parts
                      </span>
                    )}
                    {parentedRuleset && (
                      <span
                        className="text-xs px-2 py-1 rounded-md"
                        style={{
                          color: 'var(--text-muted)',
                          backgroundColor: 'var(--bg-muted)'
                        }}
                      >
                        {parentedRuleset.name}
                      </span>
                    )}
                  </div>
                  <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                    {invoice.description}
                  </p>
                </div>
                <div className="flex w-full flex-shrink-0 items-center justify-between gap-2 sm:w-auto sm:justify-end">
                  <div className="mr-1 text-left sm:text-right">
                    {isSplit && (
                      <span
                        className="block text-[0.65rem] font-semibold uppercase tracking-wider"
                        style={{ color: 'var(--text-subtle)' }}
                      >
                        Total
                      </span>
                    )}
                    <span className="font-bold font-mono" style={{ color: 'var(--text-primary)' }}>
                      {invoice.value.toLocaleString()} {primaryCurrency}
                    </span>
                  </div>
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

              {/* Per-part sub-rows (split invoices only) */}
              {isSplit && (
                <div
                  className="mt-4 overflow-hidden rounded-xl border"
                  style={{
                    borderColor: 'var(--border-default)',
                    backgroundColor: 'var(--bg-muted)'
                  }}
                >
                  <div
                    className="flex items-center justify-between px-4 py-2.5"
                    style={{ borderBottom: '1px solid var(--border-default)' }}
                  >
                    <div className="flex items-center gap-2">
                      <Split size={14} style={{ color: 'var(--accent-500)' }} />
                      <span
                        className="text-xs font-semibold uppercase tracking-wider"
                        style={{ color: 'var(--text-muted)' }}
                      >
                        Invoice breakdown
                      </span>
                    </div>
                    <span className="hidden text-xs sm:inline" style={{ color: 'var(--text-subtle)' }}>
                      Each part is generated separately
                    </span>
                  </div>

                  <div>
                    {parts.map(part => (
                      <div
                        key={part.partIndex}
                        className="group flex flex-wrap items-center gap-3 px-4 py-3 transition-colors hover:bg-black/[0.025] dark:hover:bg-white/[0.035] sm:flex-nowrap sm:gap-4"
                        style={{
                          borderTop: part.partIndex > 0 ? '1px solid var(--border-default)' : undefined
                        }}
                      >
                        <div
                          className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-xs font-bold"
                          style={{
                            color: 'var(--accent-700)',
                            backgroundColor: 'var(--accent-100)'
                          }}
                        >
                          {part.partIndex + 1}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                              Part {part.partIndex + 1} of {part.totalCount}
                            </span>
                            <span className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
                              #{part.invoiceNo}
                            </span>
                          </div>
                          <span className="text-xs" style={{ color: 'var(--text-subtle)' }}>
                            Variable symbol {part.variableSymbol}
                          </span>
                        </div>
                        <span
                          className="ml-11 min-w-[8rem] flex-1 text-left text-sm font-mono font-semibold sm:ml-0 sm:flex-none sm:text-right"
                          style={{ color: 'var(--text-primary)' }}
                        >
                          {part.amount.toLocaleString()} {primaryCurrency}
                        </span>
                        <button
                          onClick={() => onPreview(invoice, part.partIndex)}
                          className="btn btn-ghost btn-icon btn-sm flex-shrink-0"
                          title={`Preview part ${part.partIndex + 1}`}
                          aria-label={`Preview ${invoice.name}, part ${part.partIndex + 1} of ${part.totalCount}`}
                        >
                          <Eye
                            size={16}
                            style={{ color: 'var(--accent-600)' }}
                          />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
