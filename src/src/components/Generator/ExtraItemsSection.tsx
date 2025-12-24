import { useState } from 'react';
import NumberFlow from '@number-flow/react';
import { 
  ChevronDown,
  Package,
  Wand2,
  Loader2
} from 'lucide-react';
import ExtraItemsList from '../ExtraItemsList';
import { AnalysisProgress } from '../../utils/analyzeExtraItems';
import { Currency } from '../../types';
import { ProplatitItem } from '../../hooks/useProplatitFiles';

interface ExtraItemsSectionProps {
  items: ProplatitItem[];
  primaryCurrency: Currency;
  totalValue: number;
  onUpdateItem: (index: number, value: number, currency: Currency, selected: boolean) => void;
  canAnalyze: boolean;
  analyzing: boolean;
  analysisProgress: AnalysisProgress | null;
  analyzingIndices: Set<number>;
  onAnalyze: () => void;
}

export function ExtraItemsSection({
  items,
  primaryCurrency,
  totalValue,
  onUpdateItem,
  canAnalyze,
  analyzing,
  analysisProgress,
  analyzingIndices,
  onAnalyze
}: ExtraItemsSectionProps) {
  const [expanded, setExpanded] = useState(true);

  if (items.length === 0) return null;

  return (
    <div className="card mb-8 overflow-hidden">
      {/* Accordion Header */}
      <div 
        className="px-5 py-4 flex items-center justify-between"
        style={{ 
          backgroundColor: 'var(--bg-muted)',
          borderBottom: expanded ? '1px solid var(--border-default)' : 'none'
        }}
      >
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-3 cursor-pointer hover:opacity-80 transition-opacity"
        >
          <div 
            className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: 'var(--accent-100)' }}
          >
            <Package size={16} style={{ color: 'var(--accent-600)' }} />
          </div>
          <h3 className="font-semibold" style={{ color: 'var(--text-primary)' }}>
            Extra Items
          </h3>
          <span className="badge badge-primary">
            {items.length}
          </span>
        </button>
        <div className="flex items-center gap-4">
          {/* Analyze Button */}
          {canAnalyze && items.length > 0 && (
            <button
              onClick={onAnalyze}
              disabled={analyzing}
              className="btn btn-secondary btn-sm flex items-center gap-2"
              title="Analyze items with AI to extract amounts"
            >
              {analyzing ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  <span>
                    {analysisProgress 
                      ? `${analysisProgress.completed}/${analysisProgress.total}`
                      : 'Analyzing...'
                    }
                  </span>
                </>
              ) : (
                <>
                  <Wand2 size={14} />
                  <span>Analyze</span>
                </>
              )}
            </button>
          )}
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
          <button
            onClick={() => setExpanded(!expanded)}
            className="p-1 hover:opacity-80 transition-opacity"
          >
            <ChevronDown 
              size={20} 
              style={{ 
                color: 'var(--text-muted)',
                transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
                transition: 'transform 0.2s ease'
              }} 
            />
          </button>
        </div>
      </div>

      {/* Accordion Content */}
      <div 
        style={{ 
          maxHeight: expanded ? '1000px' : '0',
          opacity: expanded ? 1 : 0,
          overflow: 'hidden',
          transition: 'max-height 0.3s ease, opacity 0.2s ease'
        }}
      >
        <ExtraItemsList
          items={items}
          primaryCurrency={primaryCurrency}
          onUpdateItem={onUpdateItem}
          analyzingIndices={analyzingIndices}
        />
      </div>
    </div>
  );
}
