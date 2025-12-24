import { useState, useEffect, useRef } from 'react';
import { PenLine, X } from 'lucide-react';
import { ModalComponent } from '../../contexts/ModalContext';

export interface PromptModalProps {
  title: string;
  message: string;
  placeholder?: string;
  defaultValue?: string;
  confirmText?: string;
  cancelText?: string;
}

/**
 * Text input prompt modal.
 * 
 * @example
 * import { modal } from '../contexts/ModalContext';
 * import { PromptModal } from './modals/PromptModal';
 * 
 * const name = await modal.open(PromptModal, {
 *   title: 'Enter Name',
 *   message: 'Please enter your name'
 * });
 */
export const PromptModal: ModalComponent<PromptModalProps, string | null> = ({
  title,
  message,
  placeholder,
  defaultValue = '',
  confirmText = 'OK',
  cancelText = 'Cancel',
  resolve,
}) => {
  const [inputValue, setInputValue] = useState(defaultValue);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input when modal opens
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
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
        resolve(null);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [resolve]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputValue.trim()) {
      resolve(inputValue);
    }
  };

  return (
    <div 
      className="modal-backdrop"
      onClick={(e) => e.target === e.currentTarget && resolve(null)}
      style={{ animation: 'opacityFadeIn 0.2s ease-out forwards' }}
    >
      <div 
        className="modal-content w-full max-w-md p-6 relative"
        style={{ backgroundColor: 'var(--bg-surface)' }}
      >
        {/* Close button */}
        <button 
          onClick={() => resolve(null)}
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
          {title}
        </h3>

        {/* Message */}
        <p 
          className="text-center mb-4"
          style={{ color: 'var(--text-muted)' }}
        >
          {message}
        </p>

        {/* Input */}
        <form onSubmit={handleSubmit}>
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder={placeholder}
            className="w-full mb-4"
          />

          {/* Actions */}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => resolve(null)}
              className="btn btn-secondary flex-1"
            >
              {cancelText}
            </button>
            <button
              type="submit"
              disabled={!inputValue.trim()}
              className="btn btn-primary flex-1"
            >
              {confirmText}
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
    </div>
  );
};
