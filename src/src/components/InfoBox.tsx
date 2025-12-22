import { ReactNode } from 'react';
import { Info, AlertTriangle, CheckCircle, AlertCircle } from 'lucide-react';

export type InfoBoxVariant = 'info' | 'warning' | 'success' | 'error';

interface InfoBoxProps {
  children: ReactNode;
  variant?: InfoBoxVariant;
  icon?: ReactNode;
  className?: string;
}

const variantStyles: Record<InfoBoxVariant, { bg: string; border: string; icon: string; text: string }> = {
  info: {
    bg: 'var(--accent-50)',
    border: 'var(--accent-200)',
    icon: 'var(--accent-500)',
    text: 'var(--accent-700)'
  },
  warning: {
    bg: 'var(--warning-50)',
    border: 'var(--warning-500)',
    icon: 'var(--warning-500)',
    text: 'var(--warning-600)'
  },
  success: {
    bg: 'var(--success-50)',
    border: 'var(--success-500)',
    icon: 'var(--success-500)',
    text: 'var(--success-700)'
  },
  error: {
    bg: 'var(--error-50)',
    border: 'var(--error-500)',
    icon: 'var(--error-500)',
    text: 'var(--error-700)'
  }
};

const defaultIcons: Record<InfoBoxVariant, ReactNode> = {
  info: <Info size={16} />,
  warning: <AlertTriangle size={16} />,
  success: <CheckCircle size={16} />,
  error: <AlertCircle size={16} />
};

export function InfoBox({ children, variant = 'info', icon, className = '' }: InfoBoxProps) {
  const styles = variantStyles[variant];
  const displayIcon = icon ?? defaultIcons[variant];

  return (
    <div 
      className={`info-box ${className}`}
      style={{ 
        backgroundColor: styles.bg,
        borderColor: styles.border,
        color: styles.text
      }}
    >
      <span className="info-box-icon" style={{ color: styles.icon }}>
        {displayIcon}
      </span>
      <span className="info-box-content">
        {children}
      </span>
    </div>
  );
}

