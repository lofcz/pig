import { memo } from 'react';
import ExtraItem from './ExtraItem';
import { ProplatitItem } from '../hooks';
import styles from './ExtraItemsList.module.css';

interface ExtraItemsListProps {
  items: ProplatitItem[];
  onUpdateItem: (index: number, value: number, currency: 'CZK' | 'EUR' | 'USD', selected: boolean) => void;
}

function ExtraItemsList({ items, onUpdateItem }: ExtraItemsListProps) {
  return (
    <div className={styles.grid}>
      {items.map((item, index) => (
        <ExtraItem
          key={item.file.path}
          fileName={item.file.name}
          filePath={item.file.path}
          value={item.value}
          currency={item.currency}
          onUpdate={(value, currency, selected) => onUpdateItem(index, value, currency, selected)}
        />
      ))}
    </div>
  );
}

export default memo(ExtraItemsList);
