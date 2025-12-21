import { useState, useRef, useCallback, memo } from 'react';
import { createPortal } from 'react-dom';
import ReactCalendar from 'react-calendar';
import { Calendar, ChevronDown } from 'lucide-react';
import { useEventListener } from '../hooks';
import 'react-calendar/dist/Calendar.css';

type DatePickerSize = 'default' | 'sm';

interface DatePickerProps {
  /** Value in "YYYY-MM" format */
  value: string;
  /** Callback with "YYYY-MM" format */
  onChange: (value: string) => void;
  placeholder?: string;
  size?: DatePickerSize;
  disabled?: boolean;
}

// Unified sizing to match input styles from App.css
const SIZE_CONFIG = {
  default: {
    padding: '0.625rem 0.875rem',  // Matches input padding
    fontSize: '0.9375rem',          // Matches input font-size
    minHeight: '42px',              // Matches input height
    iconSize: 16,
    gap: '0.625rem',
  },
  sm: {
    padding: '0.375rem 0.625rem',   // Compact version
    fontSize: '0.8125rem',          // Matches Select sm
    minHeight: '32px',
    iconSize: 14,
    gap: '0.5rem',
  },
} as const;

function DatePickerInner({ value, onChange, placeholder, size = 'default', disabled = false }: DatePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [dropdownPosition, setDropdownPosition] = useState<{ top: number; left: number } | null>(null);

  const config = SIZE_CONFIG[size];

  // Parse "YYYY-MM" to Date
  const dateValue = value ? (() => {
    const [year, month] = value.split('-').map(Number);
    return new Date(year, month - 1, 1);
  })() : new Date();

  // Format Date to "YYYY-MM"
  const formatToYearMonth = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
  };

  // Format for display
  const displayValue = value ? (() => {
    const [year, month] = value.split('-').map(Number);
    const date = new Date(year, month - 1, 1);
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short' });
  })() : '';

  // Calculate dropdown position synchronously
  const getPosition = useCallback(() => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      return {
        top: rect.bottom + 4,
        left: rect.left,
      };
    }
    return null;
  }, []);

  // Update position (for scroll/resize)
  const updatePosition = useCallback(() => {
    const pos = getPosition();
    if (pos) setDropdownPosition(pos);
  }, [getPosition]);

  // Handle open/close - calculate position synchronously before opening
  const handleToggle = useCallback(() => {
    if (disabled) return;
    
    if (!isOpen) {
      // Calculate position BEFORE opening to prevent flash
      const pos = getPosition();
      if (pos) {
        setDropdownPosition(pos);
        setIsOpen(true);
      }
    } else {
      setIsOpen(false);
    }
  }, [disabled, isOpen, getPosition]);

  // Close on click outside
  useEventListener({
    type: 'mousedown',
    handler: (e) => {
      const target = e.target as Node;
      if (
        triggerRef.current && !triggerRef.current.contains(target) &&
        dropdownRef.current && !dropdownRef.current.contains(target)
      ) {
        setIsOpen(false);
      }
    },
    enabled: isOpen
  });

  // Close on Escape
  useEventListener({
    type: 'keydown',
    handler: (e) => {
      if (e.key === 'Escape') setIsOpen(false);
    },
    enabled: isOpen
  });

  // Update position on scroll/resize
  useEventListener({
    type: 'scroll',
    handler: updatePosition,
    enabled: isOpen,
    options: { passive: true, capture: true }
  });

  useEventListener({
    type: 'resize',
    handler: updatePosition,
    enabled: isOpen
  });

  const handleChange = (date: unknown) => {
    if (date instanceof Date) {
      onChange(formatToYearMonth(date));
      setIsOpen(false);
    }
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={handleToggle}
        disabled={disabled}
        className="date-picker-trigger"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: config.gap,
          padding: config.padding,
          minHeight: config.minHeight,
          fontSize: config.fontSize,
          fontFamily: 'var(--font-sans)',
          backgroundColor: 'var(--input-bg)',
          border: '1px solid var(--input-border)',
          borderRadius: 'var(--radius-md)',
          color: displayValue ? 'var(--text-primary)' : 'var(--text-muted)',
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.6 : 1,
          transition: 'border-color 150ms ease, box-shadow 150ms ease, background-color 150ms ease',
          width: '100%',
        }}
      >
        <Calendar size={config.iconSize} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
        <span style={{ flex: 1, textAlign: 'left' }}>{displayValue || placeholder || 'Select month'}</span>
        <ChevronDown 
          size={config.iconSize} 
          style={{ 
            color: 'var(--text-muted)', 
            flexShrink: 0,
            transition: 'transform 200ms ease',
            transform: isOpen ? 'rotate(180deg)' : undefined 
          }} 
        />
      </button>

      {isOpen && dropdownPosition && createPortal(
        <div
          ref={dropdownRef}
          className="date-picker-dropdown"
          style={{
            position: 'fixed',
            top: dropdownPosition.top,
            left: dropdownPosition.left,
            zIndex: 9999,
            backgroundColor: 'var(--bg-elevated)',
            border: '1px solid var(--border-default)',
            borderRadius: '8px',
            boxShadow: '0 10px 40px -10px rgba(0, 0, 0, 0.25), 0 4px 16px -4px rgba(0, 0, 0, 0.15)',
            animation: 'datePickerFadeIn 0.15s ease-out',
          }}
        >
          <ReactCalendar
            onChange={handleChange}
            value={dateValue}
            defaultView="year"
            maxDetail="year"
            minDetail="decade"
          />
        </div>,
        document.body
      )}

      <style>{`
        @keyframes datePickerFadeIn {
          from {
            opacity: 0;
            transform: translateY(-4px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .date-picker-trigger:hover:not(:disabled) {
          border-color: var(--text-muted);
        }

        .date-picker-trigger:focus {
          outline: none;
          border-color: var(--input-border-focus);
          box-shadow: 0 0 0 3px var(--input-ring);
        }

        .date-picker-dropdown .react-calendar {
          border: none;
          background: transparent;
          font-family: inherit;
          width: 280px;
          color: var(--text-primary);
        }

        .date-picker-dropdown .react-calendar__navigation {
          display: flex;
          margin-bottom: 0.5rem;
        }

        .date-picker-dropdown .react-calendar__navigation button {
          background: none;
          border: none;
          padding: 0.5rem;
          font-size: 0.875rem;
          font-weight: 600;
          color: var(--text-primary);
          cursor: pointer;
          border-radius: 8px;
          transition: background 0.15s ease;
        }

        .date-picker-dropdown .react-calendar__navigation button:hover {
          background: var(--bg-muted);
        }

        .date-picker-dropdown .react-calendar__navigation button:disabled {
          color: var(--text-subtle);
          cursor: not-allowed;
        }

        .date-picker-dropdown .react-calendar__navigation button:disabled:hover {
          background: transparent;
        }

        .date-picker-dropdown .react-calendar__year-view__months,
        .date-picker-dropdown .react-calendar__decade-view__years,
        .date-picker-dropdown .react-calendar__century-view__decades {
          display: grid !important;
          grid-template-columns: repeat(3, 1fr);
          gap: 0.25rem;
          padding: 0.5rem;
        }

        .date-picker-dropdown .react-calendar__year-view__months__month,
        .date-picker-dropdown .react-calendar__decade-view__years__year,
        .date-picker-dropdown .react-calendar__century-view__decades__decade {
          padding: 0.75rem 0.5rem;
          font-size: 0.8125rem;
          font-weight: 500;
          color: var(--text-secondary);
          background: transparent;
          border: none;
          border-radius: 8px;
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .date-picker-dropdown .react-calendar__year-view__months__month:hover,
        .date-picker-dropdown .react-calendar__decade-view__years__year:hover,
        .date-picker-dropdown .react-calendar__century-view__decades__decade:hover {
          background: var(--bg-subtle);
          color: var(--text-primary);
        }

        .date-picker-dropdown .react-calendar__tile--now {
          background: transparent !important;
          color: var(--accent-500) !important;
          font-weight: 600;
          box-shadow: inset 0 0 0 2px var(--accent-500);
        }

        .date-picker-dropdown .react-calendar__tile--now:hover {
          background: var(--bg-subtle) !important;
        }

        .date-picker-dropdown .react-calendar__tile--active,
        .date-picker-dropdown .react-calendar__tile--hasActive {
          background: var(--accent-500) !important;
          color: white !important;
        }

        .date-picker-dropdown .react-calendar__tile--active:hover,
        .date-picker-dropdown .react-calendar__tile--hasActive:hover {
          background: var(--accent-600) !important;
        }
      `}</style>
    </>
  );
}

export const DatePicker = memo(DatePickerInner);
export default DatePicker;

