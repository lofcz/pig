import { useEffect, useRef } from 'react';
import { 
  Sparkles, 
  CheckCircle2, 
  Loader2, 
  X 
} from 'lucide-react';
import { Currency } from '../../types';
import { InvoiceToGenerate, InvoiceStatus } from './types';

interface GeneratingPhaseProps {
  invoices: InvoiceToGenerate[];
  statuses: InvoiceStatus[];
  fakeProgress: number;
  primaryCurrency: Currency;
}

export default function GeneratingPhase({
  invoices,
  statuses,
  fakeProgress,
  primaryCurrency,
}: GeneratingPhaseProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const completedCount = statuses.filter(s => s.status === 'done').length;
  const totalCount = invoices.length;

  // Auto-scroll to active item
  useEffect(() => {
    if (listRef.current) {
      const activeItem = listRef.current.querySelector('.generate-all-item.active');
      if (activeItem) {
        activeItem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }
  }, [statuses]);

  return (
    <div className="generate-all-generating">
      <div className="generate-all-header">
        <div className="generate-all-icon-wrapper generating">
          <Sparkles size={32} className="generate-all-icon" />
        </div>
        <h2 className="generate-all-title">Generating Invoices</h2>
        <p className="generate-all-subtitle">
          {completedCount} of {totalCount} completed
        </p>
      </div>

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

      <div className="generate-all-list" ref={listRef}>
        {invoices.map((invoice) => {
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
  );
}