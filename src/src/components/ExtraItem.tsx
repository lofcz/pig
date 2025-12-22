import { useState, useEffect, memo, useMemo } from 'react';
import { Receipt, Loader2 } from 'lucide-react';
import { openPath } from '@tauri-apps/plugin-opener';
import { Select, SelectOption, findOption } from './Select';
import styles from './ExtraItem.module.css';
import { Currency } from '../types';

const ALL_CURRENCIES: Currency[] = ['CZK', 'EUR', 'USD'];

interface ExtraItemProps {
  fileName: string;
  filePath: string;
  value: number;
  currency: Currency;
  primaryCurrency: Currency;
  isAnalyzing?: boolean;
  onUpdate: (value: number, currency: Currency, selected: boolean) => void;
}

function ExtraItem({ fileName, filePath, value, currency, primaryCurrency, isAnalyzing, onUpdate }: ExtraItemProps) {
  const [localValue, setLocalValue] = useState(value === 0 ? '' : String(value));
  const [isFocused, setIsFocused] = useState(false);
  
  // Order currency options with primary currency first
  const currencyOptions: SelectOption<Currency>[] = useMemo(() => {
    const ordered = [primaryCurrency, ...ALL_CURRENCIES.filter(c => c !== primaryCurrency)];
    return ordered.map(c => ({ value: c, label: c }));
  }, [primaryCurrency]);
  
  useEffect(() => {
    setLocalValue(value === 0 ? '' : String(value));
  }, [value]);

  const numericValue = localValue === '' ? 0 : Number(localValue);
  const isActive = numericValue > 0 || isFocused;

  const commitValue = (newCurrency: Currency = currency) => {
    onUpdate(numericValue, newCurrency, numericValue > 0);
  };

  const handleValueChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setLocalValue(e.target.value);
  };

  const handleValueFocus = () => {
    setIsFocused(true);
  };

  const handleValueBlur = () => {
    setIsFocused(false);
    commitValue();
  };

  const handleValueKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      commitValue();
      (e.target as HTMLInputElement).blur();
    }
  };

  const handleCurrencyChange = (opt: SelectOption<Currency> | null) => {
    if (opt) {
      onUpdate(numericValue, opt.value, numericValue > 0);
    }
  };

  return (
    <div className={`${styles.container} ${isActive ? styles.active : ''} ${isAnalyzing ? styles.analyzing : ''}`}>
      <button onClick={() => openPath(filePath)} className={styles.fileButton}>
        {isAnalyzing ? (
          <Loader2 size={14} className={`${styles.fileIcon} ${styles.spinning}`} />
        ) : (
          <Receipt size={14} className={styles.fileIcon} />
        )}
        <span className={styles.fileName}>{fileName}</span>
      </button>

      <input
        type="number"
        value={localValue}
        onChange={handleValueChange}
        onFocus={handleValueFocus}
        onBlur={handleValueBlur}
        onKeyDown={handleValueKeyDown}
        placeholder="0"
        className={styles.valueInput}
        disabled={isAnalyzing}
      />

      <div className={styles.currencySelect}>
        <Select<Currency>
          value={findOption(currencyOptions, currency)}
          onChange={handleCurrencyChange}
          options={currencyOptions}
          isSearchable={false}
          size="sm"
          isDisabled={isAnalyzing}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
        />
      </div>
    </div>
  );
}

export default memo(ExtraItem);
