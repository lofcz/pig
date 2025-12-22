import { memo } from 'react';
import ReactSelect, {
  Props as ReactSelectProps,
  StylesConfig,
  GroupBase,
} from 'react-select';
import ReactCreatableSelect, { CreatableProps } from 'react-select/creatable';

export interface SelectOption<T = string> {
  value: T;
  label: string;
  isDisabled?: boolean;
}

type SelectSize = 'default' | 'sm';

interface SelectProps<T = string, IsMulti extends boolean = false>
  extends Omit<ReactSelectProps<SelectOption<T>, IsMulti, GroupBase<SelectOption<T>>>, 'styles' | 'theme'> {
  size?: SelectSize;
}

interface CreatableSelectProps<T = string, IsMulti extends boolean = false>
  extends Omit<CreatableProps<SelectOption<T>, IsMulti, GroupBase<SelectOption<T>>>, 'styles' | 'theme'> {
  size?: SelectSize;
}

// Pre-built static styles - no runtime CSS variable lookups during render
const buildStyles = <T, IsMulti extends boolean>(
  isSmall: boolean
): StylesConfig<SelectOption<T>, IsMulti, GroupBase<SelectOption<T>>> => ({
  control: (base, state) => ({
    ...base,
    backgroundColor: 'var(--input-bg)',
    borderColor: state.isFocused 
      ? 'var(--input-border-focus)' 
      : state.isDisabled 
        ? 'var(--border-muted)'
        : 'var(--input-border)',
    borderRadius: '10px',
    padding: isSmall ? '0' : '0',
    fontSize: isSmall ? '0.8125rem' : '0.9375rem',
    // Lock height so Select matches DatePicker/Input heights everywhere
    // (but allow multi-selects to grow vertically as tags wrap)
    height: state.selectProps.isMulti ? undefined : 'var(--control-height)',
    minHeight: 'var(--control-height)',
    boxShadow: state.isFocused ? '0 0 0 3px var(--input-ring)' : 'none',
    cursor: state.isDisabled ? 'not-allowed' : 'pointer',
    opacity: state.isDisabled ? 0.6 : 1,
    transition: 'border-color 150ms ease, box-shadow 150ms ease, background-color 150ms ease',
    '&:hover': {
      borderColor: state.isFocused 
        ? 'var(--input-border-focus)'
        : 'var(--text-muted)',
    },
  }),
  
  valueContainer: (base) => ({
    ...base,
    padding: isSmall ? '0.375rem 0.625rem' : '0.625rem 0.875rem',
  }),

  indicatorsContainer: (base) => ({
    ...base,
    height: '100%',
  }),
  
  singleValue: (base, state) => ({
    ...base,
    color: state.isDisabled ? 'var(--text-muted)' : 'var(--text-primary)',
    margin: 0,
  }),
  
  placeholder: (base) => ({
    ...base,
    color: 'var(--text-muted)',
    margin: 0,
  }),
  
  input: (base, state) => ({
    ...base,
    color: 'var(--text-primary)',
    margin: 0,
    padding: 0,
    // Remove inner input outline (control wrapper already has focus ring)
    outline: 'none',
    // Hide blinking cursor when not searchable
    caretColor: state.selectProps.isSearchable === false ? 'transparent' : undefined,
  }),
  
  menu: (base) => ({
    ...base,
    backgroundColor: 'var(--bg-elevated)',
    borderRadius: '8px',
    border: '1px solid var(--border-default)',
    boxShadow: '0 10px 40px -10px rgba(0, 0, 0, 0.25), 0 4px 16px -4px rgba(0, 0, 0, 0.15)',
    padding: '4px',
    overflow: 'hidden',
  }),
  
  menuPortal: (base) => ({
    ...base,
    zIndex: 9999,
  }),
  
  menuList: (base) => ({
    ...base,
    padding: 0,
  }),
  
  option: (base, state) => ({
    ...base,
    backgroundColor: state.isSelected
      ? 'var(--accent-500)'
      : state.isFocused
        ? 'var(--bg-muted)'
        : 'transparent',
    color: state.isSelected
      ? '#ffffff'
      : state.isDisabled
        ? 'var(--text-subtle)'
        : 'var(--text-primary)',
    cursor: state.isDisabled ? 'not-allowed' : 'pointer',
    padding: isSmall ? '6px 10px' : '8px 12px',
    fontSize: isSmall ? '0.8125rem' : '0.9375rem',
    borderRadius: '4px',
    marginBottom: '2px',
    transition: 'background-color 100ms ease',
    '&:last-child': {
      marginBottom: 0,
    },
    '&:active': {
      backgroundColor: state.isSelected
        ? 'var(--accent-600)'
        : 'var(--bg-subtle)',
    },
  }),
  
  indicatorSeparator: () => ({
    display: 'none',
  }),
  
  dropdownIndicator: (base, state) => ({
    ...base,
    color: state.isDisabled ? 'var(--text-subtle)' : 'var(--text-muted)',
    padding: isSmall ? '4px' : '8px',
    transition: 'color 150ms ease, transform 200ms ease',
    transform: state.selectProps.menuIsOpen ? 'rotate(180deg)' : undefined,
    '&:hover': {
      color: 'var(--text-secondary)',
    },
  }),
  
  clearIndicator: (base) => ({
    ...base,
    color: 'var(--text-muted)',
    padding: isSmall ? '4px' : '8px',
    '&:hover': {
      color: 'var(--error-500)',
    },
  }),
  
  multiValue: (base) => ({
    ...base,
    backgroundColor: 'var(--accent-100)',
    borderRadius: '4px',
  }),
  
  multiValueLabel: (base) => ({
    ...base,
    color: 'var(--accent-700)',
    fontSize: isSmall ? '0.75rem' : '0.875rem',
    padding: '2px 6px',
  }),
  
  multiValueRemove: (base) => ({
    ...base,
    color: 'var(--accent-600)',
    '&:hover': {
      backgroundColor: 'var(--accent-200)',
      color: 'var(--accent-800)',
    },
  }),
  
  noOptionsMessage: (base) => ({
    ...base,
    color: 'var(--text-muted)',
    fontSize: isSmall ? '0.8125rem' : '0.9375rem',
  }),
  
  loadingMessage: (base) => ({
    ...base,
    color: 'var(--text-muted)',
  }),
  
  loadingIndicator: (base) => ({
    ...base,
    color: 'var(--accent-500)',
  }),
});

// Pre-compute styles for both sizes to avoid any runtime work
const STYLES_DEFAULT = buildStyles(false);
const STYLES_SM = buildStyles(true);

function SelectInner<T = string, IsMulti extends boolean = false>({
  size = 'default',
  ...props
}: SelectProps<T, IsMulti>) {
  // Use pre-computed styles - zero computation during render
  const styles = size === 'sm' ? STYLES_SM : STYLES_DEFAULT;
  
  return (
    <ReactSelect<SelectOption<T>, IsMulti, GroupBase<SelectOption<T>>>
      {...props}
      styles={styles as StylesConfig<SelectOption<T>, IsMulti, GroupBase<SelectOption<T>>>}
      menuPortalTarget={document.body}
    />
  );
}

// Memoize the entire Select component
export const Select = memo(SelectInner) as typeof SelectInner;

function CreatableSelectInner<T = string, IsMulti extends boolean = false>({
  size = 'default',
  ...props
}: CreatableSelectProps<T, IsMulti>) {
  // Use pre-computed styles - zero computation during render
  const styles = size === 'sm' ? STYLES_SM : STYLES_DEFAULT;
  
  return (
    <ReactCreatableSelect<SelectOption<T>, IsMulti, GroupBase<SelectOption<T>>>
      {...props}
      styles={styles as StylesConfig<SelectOption<T>, IsMulti, GroupBase<SelectOption<T>>>}
      menuPortalTarget={document.body}
    />
  );
}

export const CreatableSelect = memo(CreatableSelectInner) as typeof CreatableSelectInner;

// Helper to create options from simple value arrays
export function createOptions<T extends string>(
  values: readonly T[],
  labelMap?: Record<T, string>
): SelectOption<T>[] {
  return values.map((value) => ({
    value,
    label: labelMap?.[value] ?? value,
  }));
}

// Helper to find option by value
export function findOption<T>(
  options: SelectOption<T>[],
  value: T | undefined | null
): SelectOption<T> | null {
  if (value === undefined || value === null) return null;
  return options.find((opt) => opt.value === value) ?? null;
}

export default Select;
