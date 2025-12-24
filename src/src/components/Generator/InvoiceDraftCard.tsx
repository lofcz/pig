import { 
  FileSignature, 
  Hash, 
  FileText, 
  Eye,
  CheckCircle2,
  Pencil,
  X
} from 'lucide-react';
import { findOption, CreatableSelect } from '../Select';
import { Config } from '../../types';
import { InvoiceDraft, DraftUserEdits } from './types';

interface InvoiceDraftCardProps {
  draft: InvoiceDraft;
  index: number;
  config: Config;
  drafts: InvoiceDraft[];
  editingAmountId: string | null;
  totalOverrides: Map<string, number>;
  computedBaseTotals: Map<string, number>;
  onPreview: (draft: InvoiceDraft) => void;
  onSetEditingAmountId: (id: string | null) => void;
  onSetTotalOverrides: (updater: (prev: Map<string, number>) => Map<string, number>) => void;
  onUpdateDraft: (index: number, updates: Partial<InvoiceDraft>) => void;
  onTrackUserEdit: (draftId: string, edits: Partial<DraftUserEdits>) => void;
}

export function InvoiceDraftCard({
  draft,
  index,
  config,
  drafts,
  editingAmountId,
  totalOverrides,
  computedBaseTotals,
  onPreview,
  onSetEditingAmountId,
  onSetTotalOverrides,
  onUpdateDraft,
  onTrackUserEdit
}: InvoiceDraftCardProps) {
  const periodKey = `${draft.rulesetId}-${draft.year}-${draft.month}`;
  const overrideValue = totalOverrides.get(periodKey);
  const baseValue = computedBaseTotals.get(periodKey);
  const hasEffectiveOverride = overrideValue !== undefined && overrideValue !== baseValue;
  
  const draftRuleset = config.rulesets.find(r => r.id === draft.rulesetId);
  const maxVal = draftRuleset?.maxInvoiceValue;
  const isSplit = maxVal && draft.monthSalary > maxVal;
  const isRemainder = draft.index > 0;

  // Calculate remainder info for subline
  const getRemainderInfo = () => {
    if (!isRemainder) return null;
    
    const periodRemainders = drafts.filter(d => 
      d.rulesetId === draft.rulesetId && 
      d.year === draft.year && 
      d.month === draft.month && 
      d.index > 0
    );
    
    if (periodRemainders.length <= 1) return null;
    
    const totalRemainder = periodRemainders.reduce((sum, d) => sum + d.amount, 0);
    const totalExtra = periodRemainders.reduce((sum, d) => sum + (d.extraValue || 0), 0);
    const baseRemainder = totalRemainder - totalExtra;
    
    return { totalRemainder, totalExtra, baseRemainder };
  };

  const remainderInfo = getRemainderInfo();

  return (
    <div 
      className={`card overflow-hidden card-hover relative ${draft.status === 'done' ? 'draft-done' : 'draft-pending'}`}
    >
      {/* Generated Overlay */}
      {draft.status === 'done' && (
        <div className="absolute inset-0 flex items-center justify-center z-10 draft-done-overlay">
          <div className="flex items-center gap-2 px-6 py-3 rounded-full draft-done-badge">
            <CheckCircle2 size={20} />
            <span className="font-bold">Generated</span>
          </div>
        </div>
      )}

      <div className="p-5">
        {/* Header Row */}
        <div className="flex items-start justify-between mb-4">
          <div>
            <button
              onClick={() => onPreview(draft)}
              className="group flex items-center gap-2 text-xl font-bold transition-colors cursor-pointer"
              style={{ color: 'var(--accent-600)' }}
            >
              <FileSignature size={22} />
              <span className="group-hover:underline">{draft.label}</span>
              <Eye 
                size={16} 
                className="opacity-0 group-hover:opacity-100 transition-opacity" 
              />
            </button>
            <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
              Click to preview invoice
            </p>
          </div>

          <div className="text-right">
            {editingAmountId === draft.id ? (
              <div className="flex items-center gap-2 justify-end">
                <input
                  type="number"
                  autoFocus
                  defaultValue={overrideValue !== undefined ? overrideValue : draft.periodBaseSalary}
                  className="w-32 text-right font-mono text-lg"
                  onBlur={(e) => {
                    const newTotal = Number(e.target.value);
                    if (!isNaN(newTotal) && newTotal >= 0) {
                      if (newTotal === draft.periodBaseSalary) {
                        onSetTotalOverrides(prev => {
                          const next = new Map(prev);
                          next.delete(periodKey);
                          return next;
                        });
                      } else {
                        onSetTotalOverrides(prev => new Map(prev).set(periodKey, newTotal));
                      }
                    }
                    onSetEditingAmountId(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      (e.target as HTMLInputElement).blur();
                    } else if (e.key === 'Escape') {
                      onSetEditingAmountId(null);
                    }
                  }}
                />
                <span className="text-lg font-bold" style={{ color: 'var(--text-muted)' }}>
                  {config.primaryCurrency}
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-2 justify-end">
                <div 
                  className="text-2xl font-bold font-mono"
                  style={{ color: 'var(--text-primary)' }}
                >
                  {draft.amount.toLocaleString()} {config.primaryCurrency}
                </div>
                {draft.index === 0 && (
                  <button
                    onClick={() => onSetEditingAmountId(draft.id)}
                    className="p-1.5 rounded-lg transition-colors hover:bg-black/5 dark:hover:bg-white/10"
                    style={{ color: 'var(--text-muted)' }}
                    title="Edit total amount"
                  >
                    <Pencil size={16} />
                  </button>
                )}
                {hasEffectiveOverride && draft.index === 0 && (
                  <button
                    onClick={() => {
                      onSetTotalOverrides(prev => {
                        const next = new Map(prev);
                        next.delete(periodKey);
                        return next;
                      });
                    }}
                    className="p-1 rounded-lg transition-colors hover:bg-red-500/10"
                    style={{ color: 'var(--error-500)' }}
                    title="Reset to calculated amount"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            )}
            
            {/* Subline rendering */}
            {isRemainder && remainderInfo && (
              remainderInfo.totalExtra > 0 ? (
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                  / {remainderInfo.totalRemainder.toLocaleString()} {config.primaryCurrency} ({remainderInfo.baseRemainder.toLocaleString()} {config.primaryCurrency} + {remainderInfo.totalExtra.toLocaleString()} {config.primaryCurrency})
                </p>
              ) : (
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                  / {remainderInfo.totalRemainder.toLocaleString()} {config.primaryCurrency}
                </p>
              )
            )}
            
            {!isRemainder && draft.extraValue && (
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                {draft.amount - draft.extraValue > 0 ? `${(draft.amount - draft.extraValue).toLocaleString()} + ` : ''}{draft.extraValue.toLocaleString()} {config.primaryCurrency} extra
              </p>
            )}
            
            {!isRemainder && !draft.extraValue && hasEffectiveOverride && isSplit && (
              <p className="text-sm">
                <span style={{ color: 'var(--text-muted)' }}>/ </span>
                <span style={{ color: 'var(--accent-500)' }}>
                  {overrideValue!.toLocaleString()} {config.primaryCurrency} (split, custom)
                </span>
              </p>
            )}
            
            {!isRemainder && !draft.extraValue && hasEffectiveOverride && !isSplit && (
              <p className="text-sm" style={{ color: 'var(--accent-500)' }}>
                (custom)
              </p>
            )}
            
            {!isRemainder && !draft.extraValue && !hasEffectiveOverride && isSplit && draft.amount === maxVal && (
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                / {draft.periodBaseSalary.toLocaleString()} {config.primaryCurrency} (split)
              </p>
            )}
          </div>
        </div>

        {/* Form Fields */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div>
            <label 
              className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide mb-2"
              style={{ color: 'var(--text-muted)' }}
            >
              <Hash size={14} />
              Number / VS
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={draft.invoiceNoOverride}
                onChange={e => {
                  const newValue = e.target.value;
                  onTrackUserEdit(draft.id, { 
                    invoiceNoOverride: newValue,
                    variableSymbolOverride: draft.variableSymbolOverride === draft.invoiceNoOverride ? newValue : undefined
                  });
                  
                  onUpdateDraft(index, {
                    invoiceNoOverride: newValue,
                    variableSymbolOverride: draft.variableSymbolOverride === draft.invoiceNoOverride 
                      ? newValue 
                      : draft.variableSymbolOverride
                  });
                }}
                className="flex-1 font-mono"
              />
              <input
                type="text"
                value={draft.variableSymbolOverride}
                onChange={e => {
                  const newValue = e.target.value;
                  onTrackUserEdit(draft.id, { variableSymbolOverride: newValue });
                  onUpdateDraft(index, { variableSymbolOverride: newValue });
                }}
                className="flex-1 font-mono"
              />
            </div>
          </div>

          <div>
            <label 
              className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide mb-2"
              style={{ color: 'var(--text-muted)' }}
            >
              <FileText size={14} />
              Description
            </label>
            <CreatableSelect
              value={(() => {
                const options = (config.rulesets.find(r => r.id === draft.rulesetId)?.descriptions || []).map(d => ({ value: d, label: d }));
                const found = findOption(options, draft.description);
                if (found) return found;
                return draft.description ? { value: draft.description, label: draft.description } : null;
              })()}
              onChange={(opt) => {
                const newValue = opt ? opt.value : '';
                onTrackUserEdit(draft.id, { description: newValue });
                onUpdateDraft(index, { description: newValue });
              }}
              options={(config.rulesets.find(r => r.id === draft.rulesetId)?.descriptions || []).map(d => ({ value: d, label: d }))}
              isClearable
              placeholder="Select or type..."
              formatCreateLabel={(inputValue) => `Use "${inputValue}"`}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
