import {
  forwardRef,
  memo,
  useCallback,
  useMemo,
  useState,
  type FocusEvent,
  type InputHTMLAttributes,
} from 'react';

type NativeInputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'type' | 'inputMode' | 'value' | 'defaultValue' | 'onChange'
>;

export interface FormattedNumberInputProps extends NativeInputProps {
  value?: string | number;
  defaultValue?: string | number;
  maxFractionDigits?: number;
  onValueChange?: (rawValue: string) => void;
  onValueCommit?: (numericValue: number | null) => void;
}

function normalizeValue(value: string | number | undefined): string {
  if (value === undefined || value === '') return '';
  return String(value).replace(/,/g, '').replace(/\s/g, '');
}

function parseInput(value: string, maxFractionDigits: number): string | null {
  const ungrouped = normalizeValue(value);
  if (!/^\d*(?:\.\d*)?$/.test(ungrouped)) return null;

  const decimalPart = ungrouped.split('.')[1];
  if (decimalPart && decimalPart.length > maxFractionDigits) return null;
  return ungrouped;
}

export function formatNumberInput(value: string | number): string {
  const normalized = normalizeValue(value);
  if (!normalized) return '';

  const [integerPart, decimalPart] = normalized.split('.');
  const groupedInteger = (integerPart || '0').replace(/\B(?=(\d{3})+(?!\d))/g, ',');

  return normalized.includes('.')
    ? `${groupedInteger}.${decimalPart ?? ''}`
    : groupedInteger;
}

function toNumericValue(value: string): number | null {
  if (!value || value === '.') return null;
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : null;
}

const FormattedNumberInputImpl = forwardRef<HTMLInputElement, FormattedNumberInputProps>(
  function FormattedNumberInput(
    {
      value,
      defaultValue,
      maxFractionDigits = 2,
      onValueChange,
      onValueCommit,
      onBlur,
      ...inputProps
    },
    ref
  ) {
    const isControlled = value !== undefined;
    const [internalValue, setInternalValue] = useState(() => normalizeValue(defaultValue));
    const rawValue = isControlled ? normalizeValue(value) : internalValue;
    const formattedValue = useMemo(() => formatNumberInput(rawValue), [rawValue]);

    const handleChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
      const parsed = parseInput(event.target.value, maxFractionDigits);
      if (parsed === null) return;

      if (!isControlled) setInternalValue(parsed);
      onValueChange?.(parsed);
    }, [isControlled, maxFractionDigits, onValueChange]);

    const handleBlur = useCallback((event: FocusEvent<HTMLInputElement>) => {
      onValueCommit?.(toNumericValue(rawValue));
      onBlur?.(event);
    }, [onBlur, onValueCommit, rawValue]);

    return (
      <input
        {...inputProps}
        ref={ref}
        type="text"
        inputMode="decimal"
        value={formattedValue}
        onChange={handleChange}
        onBlur={handleBlur}
      />
    );
  }
);

export const FormattedNumberInput = memo(FormattedNumberInputImpl);
