import { useState, useEffect, memo } from 'react';
import { Receipt } from 'lucide-react';
import { openPath } from '@tauri-apps/plugin-opener';
import { Select, SelectOption, findOption } from './Select';
import styles from './ExtraItem.module.css';

type Currency = 'CZK' | 'EUR' | 'USD';

const CURRENCY_OPTIONS: SelectOption<Currency>[] = [
  { value: 'CZK', label: 'CZK' },
  { value: 'EUR', label: 'EUR' },
  { value: 'USD', label: 'USD' },
];

interface ExtraItemProps {
  fileName: string;
  filePath: string;
  value: number;
  currency: Currency;
  onUpdate: (value: number, currency: Currency, selected: boolean) => void;
}

function ExtraItem({ fileName, filePath, value, currency, onUpdate }: ExtraItemProps) {
  const [localValue, setLocalValue] = useState(value === 0 ? '' : String(value));
  const [isFocused, setIsFocused] = useState(false);
  
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
    <div className={`${styles.container} ${isActive ? styles.active : ''}`}>
      <button onClick={() => openPath(filePath)} className={styles.fileButton}>
        <Receipt size={14} className={styles.fileIcon} />
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
      />

      <div className={styles.currencySelect}>
        <Select<Currency>
          value={findOption(CURRENCY_OPTIONS, currency)}
          onChange={handleCurrencyChange}
          options={CURRENCY_OPTIONS}
          isSearchable={false}
          size="sm"
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
        />
      </div>
    </div>
  );
}

export default memo(ExtraItem);
