import { useEffect, useRef } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { ModalComponent } from '../../contexts/ModalContext';

export interface ConfirmModalProps {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'warning' | 'default';
}

const variantStyles = {
  danger: {
    iconBg: 'var(--error-100)',
    iconColor: 'var(--error-500)',
    confirmBg: 'var(--error-100)',
    confirmHoverBg: 'var(--error-300)',
  },
  warning: {
    iconBg: 'var(--warning-100)',
    iconColor: 'var(--warning-500)',
    confirmBg: 'var(--warning-600)',
    confirmHoverBg: 'var(--warning-700)',
  },
  default: {
    iconBg: 'var(--accent-100)',
    iconColor: 'var(--accent-500)',
    confirmBg: 'var(--accent-600)',
    confirmHoverBg: 'var(--accent-700)',
  }
};

/**
 * Confirmation dialog modal.
 * 
 * @example
 * import { modal } from '../contexts/ModalContext';
 * import { ConfirmModal } from './modals/ConfirmModal';
 * 
 * const confirmed = await modal.open(ConfirmModal, {
 *   title: 'Delete Item?',
 *   message: 'This action cannot be undone.',
 *   variant: 'danger'
 * });
 */
export const ConfirmModal: ModalComponent<ConfirmModalProps, boolean> = ({
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'danger',
  resolve,
}) => {
  const confirmButtonRef = useRef<HTMLButtonElement>(null);
  const styles = variantStyles[variant];

  // Focus confirm button when modal opens
  useEffect(() => {
    confirmButtonRef.current?.focus();
  }, []);

  // Disable body scroll when modal is open
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        resolve(false);
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        resolve(true);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [resolve]);

  return (
    <div 
      className="modal-backdrop"
      onClick={(e) => e.target === e.currentTarget && resolve(false)}
      style={{ animation: 'opacityFadeIn 0.2s ease-out forwards' }}
    >
      <div 
        className="modal-content w-full max-w-md p-6 relative"
        style={{ backgroundColor: 'var(--bg-surface)' }}
      >
        {/* Close button */}
        <button 
          onClick={() => resolve(false)}
          className="absolute top-4 right-4 btn btn-ghost btn-icon btn-sm"
          title="Close (Esc)"
        >
          <X size={18} />
        </button>

        {/* Icon */}
        <div className="flex justify-center mb-4">
          <div 
            className="w-14 h-14 rounded-full flex items-center justify-center"
            style={{ backgroundColor: styles.iconBg }}
          >
            <AlertTriangle size={28} style={{ color: styles.iconColor }} />
          </div>
        </div>

        {/* Title */}
        <h3 
          className="text-xl font-bold text-center mb-2"
          style={{ color: 'var(--text-primary)' }}
        >
          {title}
        </h3>

        {/* Message */}
        <p 
          className="text-center mb-6"
          style={{ color: 'var(--text-muted)' }}
        >
          {message}
        </p>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={() => resolve(false)}
            className="btn btn-secondary flex-1"
          >
            {cancelText}
          </button>
          <button
            ref={confirmButtonRef}
            onClick={() => resolve(true)}
            className="btn flex-1"
            style={{ 
              backgroundColor: styles.confirmBg,
              color: 'white'
            }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = styles.confirmHoverBg}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = styles.confirmBg}
          >
            {confirmText}
          </button>
        </div>

        {/* Keyboard hint */}
        <div 
          className="mt-4 text-center text-xs"
          style={{ color: 'var(--text-subtle)' }}
        >
          Press{' '}
          <kbd 
            className="px-1.5 py-0.5 rounded font-mono"
            style={{ backgroundColor: 'var(--bg-muted)', border: '1px solid var(--border-default)' }}
          >
            Enter
          </kbd>
          {' '}to confirm or{' '}
          <kbd 
            className="px-1.5 py-0.5 rounded font-mono"
            style={{ backgroundColor: 'var(--bg-muted)', border: '1px solid var(--border-default)' }}
          >
            Esc
          </kbd>
          {' '}to cancel
        </div>
      </div>
    </div>
  );
};
