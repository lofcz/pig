import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { PenLine, X } from 'lucide-react';

interface PromptOptions {
  title: string;
  message: string;
  placeholder?: string;
  defaultValue?: string;
  confirmText?: string;
  cancelText?: string;
}

interface PromptModalContextType {
  prompt: (options: PromptOptions) => Promise<string | null>;
}

const PromptModalContext = createContext<PromptModalContextType | null>(null);

export function usePrompt() {
  const context = useContext(PromptModalContext);
  if (!context) {
    throw new Error('usePrompt must be used within a PromptModalProvider');
  }
  return context.prompt;
}

interface ModalState extends PromptOptions {
  resolve: (value: string | null) => void;
}

export function PromptModalProvider({ children }: { children: React.ReactNode }) {
  const [modalState, setModalState] = useState<ModalState | null>(null);
  const [inputValue, setInputValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const prompt = useCallback((options: PromptOptions): Promise<string | null> => {
    return new Promise((resolve) => {
      setInputValue(options.defaultValue || '');
      setModalState({ ...options, resolve });
    });
  }, []);

  const handleClose = useCallback((confirmed: boolean) => {
    if (modalState) {
      modalState.resolve(confirmed ? inputValue : null);
      setModalState(null);
      setInputValue('');
    }
  }, [modalState, inputValue]);

  // Focus input when modal opens
  useEffect(() => {
    if (modalState && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
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
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [modalState, handleClose]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputValue.trim()) {
      handleClose(true);
    }
  };

  return (
    <PromptModalContext.Provider value={{ prompt }}>
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
                style={{ backgroundColor: 'var(--accent-100)' }}
              >
                <PenLine size={28} style={{ color: 'var(--accent-500)' }} />
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
              className="text-center mb-4"
              style={{ color: 'var(--text-muted)' }}
            >
              {modalState.message}
            </p>

            {/* Input */}
            <form onSubmit={handleSubmit}>
              <input
                ref={inputRef}
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder={modalState.placeholder}
                className="w-full mb-4"
              />

              {/* Actions */}
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => handleClose(false)}
                  className="btn btn-secondary flex-1"
                >
                  {modalState.cancelText || 'Cancel'}
                </button>
                <button
                  type="submit"
                  disabled={!inputValue.trim()}
                  className="btn btn-primary flex-1"
                >
                  {modalState.confirmText || 'OK'}
                </button>
              </div>
            </form>

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
    </PromptModalContext.Provider>
  );
}

