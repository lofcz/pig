import { useState, useEffect, useCallback } from 'react';

interface UseLocalValueOptions<T> {
  /** Initial value from parent */
  value: T;
  /** Transform function when committing to parent (e.g., parse string to number) */
  parse?: (localValue: string) => T;
  /** Transform function for display (e.g., number to string) */
  format?: (value: T) => string;
  /** Called when value should be committed to parent */
  onCommit: (value: T) => void;
}

/**
 * Hook for managing local input state with deferred parent updates.
 * Provides immediate UI feedback while only committing on blur/enter.
 */
export function useLocalValue<T>({
  value,
  parse,
  format,
  onCommit
}: UseLocalValueOptions<T>) {
  const formatFn = format ?? ((v: T) => String(v));
  const parseFn = parse ?? ((s: string) => s as unknown as T);
  
  const [localValue, setLocalValue] = useState(() => formatFn(value));

  // Sync from parent when value changes externally
  useEffect(() => {
    setLocalValue(formatFn(value));
  }, [value, formatFn]);

  const commit = useCallback(() => {
    const parsed = parseFn(localValue);
    onCommit(parsed);
  }, [localValue, parseFn, onCommit]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setLocalValue(e.target.value);
  }, []);

  const handleBlur = useCallback(() => {
    commit();
  }, [commit]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      commit();
      (e.target as HTMLElement).blur();
    }
  }, [commit]);

  return {
    localValue,
    setLocalValue,
    commit,
    handleChange,
    handleBlur,
    handleKeyDown,
    /** Get parsed value for derived state calculations */
    parsedValue: parseFn(localValue)
  };
}

