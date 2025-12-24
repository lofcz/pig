import { 
  Mail, 
  CheckCircle2, 
  SkipForward, 
  AlertCircle,
  FileText,
  Building2,
  User,
  Send,
  ChevronLeft
} from 'lucide-react';
import { Currency } from '../../types';
import { EmailTask } from './types';

interface EmailListPhaseProps {
  emailTasks: EmailTask[];
  currentTaskIndex: number;
  primaryCurrency: Currency;
  allEmailsDone: boolean;
  sentCount: number;
  skippedCount: number;
  onStartCompose: () => void;
  onSkipEmail: () => void;
  onBackToComplete: () => void;
  onClose: () => void;
}

export default function EmailListPhase({
  emailTasks,
  currentTaskIndex,
  primaryCurrency,
  allEmailsDone,
  sentCount,
  skippedCount,
  onStartCompose,
  onSkipEmail,
  onBackToComplete,
  onClose,
}: EmailListPhaseProps) {
  return (
    <div className="generate-all-email-list">
      <div className="generate-all-header">
        <div className="generate-all-icon-wrapper">
          <Mail size={32} className="generate-all-icon" />
        </div>
        <h2 className="generate-all-title">
          {allEmailsDone ? 'Emails Complete' : 'Send Invoice Emails'}
        </h2>
        <p className="generate-all-subtitle">
          {emailTasks.length === 0 
            ? 'No customers have complete email configuration'
            : allEmailsDone 
              ? `${sentCount} sent, ${skippedCount} skipped`
              : `${emailTasks.length} email${emailTasks.length !== 1 ? 's' : ''} to send`
          }
        </p>
      </div>

      {emailTasks.length === 0 ? (
        <div className="generate-all-empty">
          <AlertCircle size={48} style={{ color: 'var(--text-muted)', marginBottom: '1rem' }} />
          <p style={{ color: 'var(--text-muted)' }}>
            No customers have complete email setup (contact, template, and SMTP connector).
          </p>
        </div>
      ) : (
        <div className="email-task-list">
          {emailTasks.map((task, idx) => {
            const isCurrent = idx === currentTaskIndex && !allEmailsDone;
            const taskAmount = task.invoices.reduce((s, inv) => s + inv.amount, 0);

            return (
              <div 
                key={task.id}
                className={`email-task-item ${task.status} ${isCurrent ? 'current' : ''}`}
              >
                <div className="email-task-status">
                  {task.status === 'sent' ? (
                    <CheckCircle2 size={20} style={{ color: 'var(--success-500)' }} />
                  ) : task.status === 'skipped' ? (
                    <SkipForward size={20} style={{ color: 'var(--text-muted)' }} />
                  ) : task.status === 'error' ? (
                    <AlertCircle size={20} style={{ color: 'var(--error-500)' }} />
                  ) : (
                    <div className={`email-task-dot ${isCurrent ? 'current' : ''}`} />
                  )}
                </div>
                
                <div className="email-task-content">
                  <div className="email-task-recipient">
                    <User size={14} />
                    <span className="email-task-contact">{task.contact.name}</span>
                    <span className="email-task-email">&lt;{task.contact.email}&gt;</span>
                  </div>
                  <div className="email-task-meta">
                    <span className="email-task-invoices">
                      <FileText size={12} />
                      {task.invoices.length} invoice{task.invoices.length !== 1 ? 's' : ''}
                    </span>
                    {task.customers.length > 1 && (
                      <span className="email-task-customers">
                        <Building2 size={12} />
                        {task.customers.length} customers
                      </span>
                    )}
                    <span className="email-task-amount">
                      {taskAmount.toLocaleString()} {primaryCurrency}
                    </span>
                  </div>
                </div>

                {task.status === 'sent' && (
                  <div className="email-task-sent-badge">
                    <CheckCircle2 size={14} />
                    <span>Sent</span>
                  </div>
                )}
                
                {task.status === 'skipped' && (
                  <div className="email-task-skipped-badge">
                    <span>Skipped</span>
                  </div>
                )}
                
                {task.status === 'error' && (
                  <div className="email-task-error-badge">
                    <AlertCircle size={14} />
                    <span>Failed</span>
                  </div>
                )}
                
                {isCurrent && task.status === 'pending' && (
                  <div className="email-task-actions">
                    <button
                      onClick={onSkipEmail}
                      className="btn btn-ghost btn-sm"
                      title="Skip"
                    >
                      <SkipForward size={16} />
                    </button>
                    <button
                      onClick={onStartCompose}
                      className="btn btn-primary btn-sm"
                    >
                      <Send size={14} />
                      <span>Compose</span>
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="generate-all-actions">
        <button 
          onClick={onBackToComplete}
          className="btn btn-secondary generate-all-btn"
        >
          <ChevronLeft size={18} />
          <span>Back</span>
        </button>
        <button 
          onClick={onClose}
          className="btn btn-success generate-all-btn"
        >
          <CheckCircle2 size={18} />
          <span>Done</span>
        </button>
      </div>

      <p className="generate-all-hint">
        Press <kbd>Esc</kbd> to close
      </p>
    </div>
  );
}
