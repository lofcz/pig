import { useState, useEffect, useRef } from 'react';
import { Check, X } from 'lucide-react';

interface ColorSwatchPickerProps {
  colors: { name: string; value: string }[];
  currentColor: string;
  onSelect: (color: string) => void;
  onClose: () => void;
  type: 'text' | 'highlight';
}

export default function ColorSwatchPicker({ 
  colors, 
  currentColor, 
  onSelect, 
  onClose, 
  type 
}: ColorSwatchPickerProps) {
  const [customColor, setCustomColor] = useState(
    currentColor || (type === 'highlight' ? '#fef08a' : '#000000')
  );
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  return (
    <div ref={pickerRef} className="color-swatch-picker">
      <div className="color-swatch-grid">
        {colors.map((color) => (
          <button
            key={color.name}
            type="button"
            className={`color-swatch ${currentColor === color.value ? 'active' : ''} ${!color.value ? 'none' : ''}`}
            style={color.value ? { backgroundColor: color.value } : undefined}
            onClick={() => {
              onSelect(color.value);
              onClose();
            }}
            title={color.name}
          >
            {currentColor === color.value && color.value && <Check size={12} />}
            {!color.value && <X size={12} />}
          </button>
        ))}
      </div>
      <div className="color-swatch-custom">
        <span className="color-swatch-custom-label">Custom:</span>
        <input
          type="color"
          value={customColor}
          onChange={(e) => setCustomColor(e.target.value)}
          className="color-swatch-custom-input"
        />
        <button
          type="button"
          className="color-swatch-custom-apply"
          onClick={() => {
            onSelect(customColor);
            onClose();
          }}
        >
          Apply
        </button>
      </div>
    </div>
  );
}
