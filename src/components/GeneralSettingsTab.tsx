import { useState, useEffect } from 'react';
import { Config } from '../types';
import { open } from '@tauri-apps/plugin-dialog';
import { exists } from '@tauri-apps/plugin-fs';
import { useTheme, Theme } from '../contexts/ThemeContext';
import { APIKeysEditor, APIKeysEditorRef } from './APIKeysEditor';
import { toast } from 'sonner';
import {
  FolderOpen,
  Percent,
  Check,
  AlertTriangle,
  Sun,
  Moon,
  Monitor,
  Palette,
  Terminal,
  Wand2,
  Cog
} from 'lucide-react';

export interface GeneralSettingsTabRef {
  saveAPIKeys: () => Promise<void>;
}

interface GeneralSettingsTabProps {
  config: Config;
  onChange: (config: Config) => void;
  apiKeysRef: React.RefObject<APIKeysEditorRef | null>;
}

export function GeneralSettingsTab({ config, onChange, apiKeysRef }: GeneralSettingsTabProps) {
  const { theme, setTheme } = useTheme();

  const themeOptions: { value: Theme; icon: React.ReactNode; label: string }[] = [
    { value: 'light', icon: <Sun size={18} />, label: 'Light' },
    { value: 'dark', icon: <Moon size={18} />, label: 'Dark' },
    { value: 'system', icon: <Monitor size={18} />, label: 'System' },
  ];

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
      {/* Left Column - App Configuration */}
      <div className="space-y-6">
        {/* Appearance Section */}
        <SettingsSection title="Appearance" icon={Palette}>
          <div 
            className="inline-flex gap-1 p-1 rounded-xl"
            style={{ backgroundColor: 'var(--bg-surface)' }}
          >
            {themeOptions.map((option) => (
              <button
                key={option.value}
                onClick={() => setTheme(option.value)}
                className={`
                  flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all
                  ${theme === option.value 
                    ? 'shadow-sm' 
                    : 'hover:bg-black/5 dark:hover:bg-white/5'
                  }
                `}
                style={{ 
                  backgroundColor: theme === option.value ? 'var(--accent-500)' : 'transparent',
                  color: theme === option.value ? 'white' : 'var(--text-muted)'
                }}
              >
                {option.icon}
                <span>{option.label}</span>
              </button>
            ))}
          </div>
        </SettingsSection>

        {/* Paths Section */}
        <SettingsSection title="Paths" icon={FolderOpen}>
          <div className="space-y-4">
            <PathInput 
              label="Root Directory"
              value={config.rootPath}
              onChange={val => onChange({...config, rootPath: val})}
              isDirectory
            />

            <SofficePathInput
              value={config.sofficePath || ''}
              onChange={val => onChange({...config, sofficePath: val || undefined})}
            />
          </div>
        </SettingsSection>

        {/* Exchange Rates Section */}
        <SettingsSection title="Exchange Rates" icon={Percent}>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label 
                className="text-xs font-medium mb-1.5 block"
                style={{ color: 'var(--text-muted)' }}
              >
                EUR → CZK
              </label>
              <input
                type="number"
                value={config.exchangeRates.EUR}
                onChange={e => onChange({
                  ...config, 
                  exchangeRates: {...config.exchangeRates, EUR: Number(e.target.value)}
                })}
              />
            </div>
            <div>
              <label 
                className="text-xs font-medium mb-1.5 block"
                style={{ color: 'var(--text-muted)' }}
              >
                USD → CZK
              </label>
              <input
                type="number"
                value={config.exchangeRates.USD}
                onChange={e => onChange({
                  ...config, 
                  exchangeRates: {...config.exchangeRates, USD: Number(e.target.value)}
                })}
              />
            </div>
          </div>
        </SettingsSection>
      </div>

      {/* Right Column - API Keys */}
      <div>
        <APIKeysEditor ref={apiKeysRef} />
      </div>
    </div>
  );
}

// --- Shared Components ---

interface SettingsSectionProps {
  title: string;
  icon: React.ComponentType<{ size?: number }>;
  children: React.ReactNode;
}

function SettingsSection({ title, icon: Icon, children }: SettingsSectionProps) {
  return (
    <div 
      className="p-5 rounded-xl"
      style={{ backgroundColor: 'var(--bg-muted)' }}
    >
      <div className="flex items-center gap-2 mb-4">
        <Icon size={16} style={{ color: 'var(--accent-500)' }} />
        <h3 
          className="text-sm font-semibold"
          style={{ color: 'var(--text-primary)' }}
        >
          {title}
        </h3>
      </div>
      {children}
    </div>
  );
}

interface PathInputProps {
  value: string;
  onChange: (val: string) => void;
  isDirectory?: boolean;
  label: string;
}

function PathInput({ value, onChange, isDirectory = false, label }: PathInputProps) {
  const [isValid, setIsValid] = useState<boolean | null>(null);

  useEffect(() => {
    if (!value) { setIsValid(null); return; }
    exists(value).then(setIsValid).catch(() => setIsValid(false));
  }, [value]);

  const handleBrowse = async () => {
    const selected = await open({
      directory: isDirectory,
      multiple: false,
      defaultPath: value || undefined,
      filters: isDirectory ? undefined : [{ name: 'ODT Template', extensions: ['odt'] }]
    });
    if (selected && typeof selected === 'string') {
      onChange(selected);
    }
  };

  return (
    <div>
      <label 
        className="text-xs font-medium mb-1.5 block"
        style={{ color: 'var(--text-muted)' }}
      >
        {label}
      </label>
      <div className="flex gap-2 items-center">
        <div className="relative flex-1">
          <input
            type="text"
            value={value}
            onChange={e => onChange(e.target.value)}
            className={`pr-10 ${isValid === true ? 'validation-valid' : isValid === false ? 'validation-invalid' : ''}`}
          />
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            {isValid === true && <Check size={18} className="validation-valid-icon" />}
            {isValid === false && <AlertTriangle size={18} className="validation-invalid-icon" />}
          </div>
        </div>
        <button onClick={handleBrowse} className="btn btn-secondary btn-icon">
          <FolderOpen size={18} />
        </button>
      </div>
    </div>
  );
}

interface SofficePathInputProps {
  value: string;
  onChange: (val: string) => void;
}

const SOFFICE_COMMON_PATHS = [
  'C:\\Program Files\\LibreOffice\\program\\soffice.exe',
  'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe',
  'C:\\Program Files\\LibreOffice 7\\program\\soffice.exe',
  'C:\\Program Files\\LibreOffice 24\\program\\soffice.exe',
  'C:\\Program Files\\OpenOffice\\program\\soffice.exe',
  'C:\\Program Files (x86)\\OpenOffice\\program\\soffice.exe',
];

function SofficePathInput({ value, onChange }: SofficePathInputProps) {
  const [isValid, setIsValid] = useState<boolean | null>(null);
  const [isDetecting, setIsDetecting] = useState(false);

  useEffect(() => {
    if (!value) { setIsValid(null); return; }
    exists(value).then(setIsValid).catch(() => setIsValid(false));
  }, [value]);

  const handleBrowse = async () => {
    const selected = await open({
      multiple: false,
      defaultPath: value || 'C:\\Program Files',
      filters: [{ name: 'Executable', extensions: ['exe'] }]
    });
    if (selected && typeof selected === 'string') {
      onChange(selected);
    }
  };

  const handleAutoDetect = async () => {
    setIsDetecting(true);
    try {
      for (const path of SOFFICE_COMMON_PATHS) {
        if (await exists(path)) {
          onChange(path);
          toast.success('LibreOffice found!');
          setIsDetecting(false);
          return;
        }
      }
      toast.error('LibreOffice not found in common locations. Please browse manually.');
    } catch (e) {
      toast.error('Auto-detection failed');
    }
    setIsDetecting(false);
  };

  return (
    <div>
      <label 
        className="text-xs font-medium mb-1.5 block"
        style={{ color: 'var(--text-muted)' }}
      >
        LibreOffice Path
      </label>
      <div className="flex gap-2 items-center">
        <div className="relative flex-1">
          <input
            type="text"
            value={value}
            onChange={e => onChange(e.target.value)}
            placeholder="soffice (uses PATH if empty)"
            className={`pr-10 ${isValid === true ? 'validation-valid' : isValid === false ? 'validation-invalid' : ''}`}
          />
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            {isValid === true && <Check size={18} className="validation-valid-icon" />}
            {isValid === false && <AlertTriangle size={18} className="validation-invalid-icon" />}
          </div>
        </div>
        <button 
          onClick={handleAutoDetect} 
          className="btn btn-secondary btn-icon"
          disabled={isDetecting}
          title="Auto-detect LibreOffice"
        >
          <Wand2 size={18} className={isDetecting ? 'animate-spin' : ''} />
        </button>
        <button onClick={handleBrowse} className="btn btn-secondary btn-icon" title="Browse...">
          <FolderOpen size={18} />
        </button>
      </div>
      <p className="text-xs mt-1.5" style={{ color: 'var(--text-subtle)' }}>
        Path to soffice.exe for PDF conversion. Leave empty to use system PATH.
      </p>
    </div>
  );
}
