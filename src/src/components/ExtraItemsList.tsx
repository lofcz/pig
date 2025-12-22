import { memo } from 'react';
import ExtraItem from './ExtraItem';
import { ProplatitItem } from '../hooks';
import { Currency } from '../types';
import styles from './ExtraItemsList.module.css';

interface ExtraItemsListProps {
  items: ProplatitItem[];
  primaryCurrency: Currency;
  onUpdateItem: (index: number, value: number, currency: Currency, selected: boolean) => void;
  analyzingIndices?: Set<number>;
}

function ExtraItemsList({ items, primaryCurrency, onUpdateItem, analyzingIndices }: ExtraItemsListProps) {
  return (
    <div className={styles.grid}>
      {items.map((item, index) => (
        <ExtraItem
          key={item.file.path}
          fileName={item.file.name}
          filePath={item.file.path}
          value={item.value}
          currency={item.currency}
          primaryCurrency={primaryCurrency}
          isAnalyzing={analyzingIndices?.has(index) ?? false}
          onUpdate={(value, currency, selected) => onUpdateItem(index, value, currency, selected)}
        />
      ))}
    </div>
  );
}

export default memo(ExtraItemsList);
