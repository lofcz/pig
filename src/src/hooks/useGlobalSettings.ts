/**
 * Hook for managing global settings
 */

import { useState, useEffect, useCallback } from 'react';
import { 
  GlobalSettings, 
  loadGlobalSettings, 
  saveGlobalSettings,
  autoDetectSoffice,
  DEFAULT_GLOBAL_SETTINGS 
} from '../utils/globalSettings';

export interface UseGlobalSettingsReturn {
  settings: GlobalSettings;
  isLoaded: boolean;
  updateSettings: (updates: Partial<GlobalSettings>) => void;
  setTheme: (theme: GlobalSettings['theme']) => void;
  setSofficePath: (path: string | undefined) => void;
  detectSoffice: () => Promise<string | null>;
}

export function useGlobalSettings(): UseGlobalSettingsReturn {
  const [settings, setSettings] = useState<GlobalSettings>(DEFAULT_GLOBAL_SETTINGS);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load settings on mount
  useEffect(() => {
    const loaded = loadGlobalSettings();
    setSettings(loaded);
    setIsLoaded(true);
  }, []);

  // Apply theme whenever settings change
  useEffect(() => {
    if (!isLoaded) return;
    
    const root = document.documentElement;
    if (settings.theme === 'system') {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      root.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
    } else {
      root.setAttribute('data-theme', settings.theme);
    }
  }, [settings.theme, isLoaded]);

  // Listen for system theme changes
  useEffect(() => {
    if (settings.theme !== 'system') return;
    
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => {
      document.documentElement.setAttribute('data-theme', e.matches ? 'dark' : 'light');
    };
    
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, [settings.theme]);

  const updateSettings = useCallback((updates: Partial<GlobalSettings>) => {
    setSettings(prev => {
      const updated = { ...prev, ...updates };
      saveGlobalSettings(updated);
      return updated;
    });
  }, []);

  const setTheme = useCallback((theme: GlobalSettings['theme']) => {
    updateSettings({ theme });
  }, [updateSettings]);

  const setSofficePath = useCallback((path: string | undefined) => {
    updateSettings({ sofficePath: path });
  }, [updateSettings]);

  const detectSoffice = useCallback(async () => {
    const detected = await autoDetectSoffice();
    if (detected) {
      setSofficePath(detected);
    }
    return detected;
  }, [setSofficePath]);

  return {
    settings,
    isLoaded,
    updateSettings,
    setTheme,
    setSofficePath,
    detectSoffice,
  };
}

