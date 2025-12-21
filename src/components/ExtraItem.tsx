import { useState, useEffect, memo } from 'react';
import { Receipt } from 'lucide-react';
import { openPath } from '@tauri-apps/plugin-opener';
import styles from './ExtraItem.module.css';

interface ExtraItemProps {
  fileName: string;
  filePath: string;
  value: number;
  currency: 'CZK' | 'EUR' | 'USD';
  onUpdate: (value: number, currency: 'CZK' | 'EUR' | 'USD', selected: boolean) => void;
}

function ExtraItem({ fileName, filePath, value, currency, onUpdate }: ExtraItemProps) {
  const [localValue, setLocalValue] = useState(value === 0 ? '' : String(value));
  const [isFocused, setIsFocused] = useState(false);
  
  useEffect(() => {
    setLocalValue(value === 0 ? '' : String(value));
  }, [value]);

  const numericValue = localValue === '' ? 0 : Number(localValue);
  const isActive = numericValue > 0 || isFocused;

  const commitValue = (newCurrency: 'CZK' | 'EUR' | 'USD' = currency) => {
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

  const handleCurrencyChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newCurrency = e.target.value as 'CZK' | 'EUR' | 'USD';
    onUpdate(numericValue, newCurrency, numericValue > 0);
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

      <select
        value={currency}
        onChange={handleCurrencyChange}
        className={styles.currencySelect}
      >
        <option value="CZK">CZK</option>
        <option value="EUR">EUR</option>
        <option value="USD">USD</option>
      </select>
    </div>
  );
}

export default memo(ExtraItem);
