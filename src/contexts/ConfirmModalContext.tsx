import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, X } from 'lucide-react';

interface ConfirmOptions {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'warning' | 'default';
}

interface ConfirmModalContextType {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
}

const ConfirmModalContext = createContext<ConfirmModalContextType | null>(null);

export function useConfirm() {
  const context = useContext(ConfirmModalContext);
  if (!context) {
    throw new Error('useConfirm must be used within a ConfirmModalProvider');
  }
  return context.confirm;
}

interface ModalState extends ConfirmOptions {
  resolve: (value: boolean) => void;
}

export function ConfirmModalProvider({ children }: { children: React.ReactNode }) {
  const [modalState, setModalState] = useState<ModalState | null>(null);
  const confirmButtonRef = useRef<HTMLButtonElement>(null);

  const confirm = useCallback((options: ConfirmOptions): Promise<boolean> => {
    return new Promise((resolve) => {
      setModalState({ ...options, resolve });
    });
  }, []);

  const handleClose = useCallback((result: boolean) => {
    if (modalState) {
      modalState.resolve(result);
      setModalState(null);
    }
  }, [modalState]);

  // Focus confirm button when modal opens
  useEffect(() => {
    if (modalState && confirmButtonRef.current) {
      confirmButtonRef.current.focus();
    }
  }, [modalState]);

  // Disable body scroll when modal is open
  useEffect(() => {
    if (modalState) {
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = '';
      };
    }
  }, [modalState]);

  // Handle keyboard shortcuts
  useEffect(() => {
    if (!modalState) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        handleClose(false);
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        handleClose(true);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [modalState, handleClose]);

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

  const styles = modalState ? variantStyles[modalState.variant || 'danger'] : variantStyles.danger;

  return (
    <ConfirmModalContext.Provider value={{ confirm }}>
      {children}
      {modalState && createPortal(
        <div 
          className="modal-backdrop"
          onClick={(e) => e.target === e.currentTarget && handleClose(false)}
          style={{ animation: 'opacityFadeIn 0.2s ease-out forwards' }}
        >
          <div 
            className="modal-content w-full max-w-md p-6 relative"
            style={{ backgroundColor: 'var(--bg-surface)' }}
          >
            {/* Close button */}
            <button 
              onClick={() => handleClose(false)}
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
              {modalState.title}
            </h3>

            {/* Message */}
            <p 
              className="text-center mb-6"
              style={{ color: 'var(--text-muted)' }}
            >
              {modalState.message}
            </p>

            {/* Actions */}
            <div className="flex gap-3">
              <button
                onClick={() => handleClose(false)}
                className="btn btn-secondary flex-1"
              >
                {modalState.cancelText || 'Cancel'}
              </button>
              <button
                ref={confirmButtonRef}
                onClick={() => handleClose(true)}
                className="btn flex-1"
                style={{ 
                  backgroundColor: styles.confirmBg,
                  color: 'white'
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = styles.confirmHoverBg}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = styles.confirmBg}
              >
                {modalState.confirmText || 'Confirm'}
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
        </div>,
        document.body
      )}
    </ConfirmModalContext.Provider>
  );
}

