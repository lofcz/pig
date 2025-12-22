import { useEffect, useState, useRef, useCallback } from 'react';
import { loadConfig, saveTheme } from './utils/config';
import { Config, ThemePreference } from './types';
import Generator, { GeneratorRef } from './components/Generator';
import ConfigEditor, { ConfigEditorRef, SETTINGS_TABS, SettingsTabId } from './components/ConfigEditor';
import { ThemeProvider, Theme, useTheme } from './contexts/ThemeContext';
import { ConfirmModalProvider } from './contexts/ConfirmModalContext';
import { PromptModalProvider } from './contexts/PromptModalContext';
import { Toaster } from 'sonner';
import { FileText, Settings, Save, Loader2, Menu, X, Home } from 'lucide-react';
import './App.css';

type TaglineTriplet = readonly [string, string, string];

const TAGLINE_TRIPLETS: readonly TaglineTriplet[] = [
  ['Infinite', 'Money', 'Glitch'],
  ['Death', 'And', 'Taxes'],
  ['Your', 'Papers', 'Please'],
  ['Terry', 'Andrew', 'Davis'],
  ['50%', 'Less', 'Bugs'],
  ['Crash', 'To', 'Desktop'],
  ['Fortis', 'Fortuna', 'Adiuvat'],
  ['Audentes', 'Fortuna', 'Adiuvat'],
  ['Audentes', 'Fortuna', 'Adiuvat'],
  ['Pacta', 'Sunt', 'Servanda'],
] as const;

function pickRandomTriplet<T>(items: readonly T[], fallback: T): T {
  if (items.length === 0) return fallback;
  return items[Math.floor(Math.random() * items.length)] ?? fallback;
}

function formatTriplet([a, b, c]: TaglineTriplet) {
  return `${a} • ${b} • ${c}`;
}

function AppContent({
  config,
  setConfig,
  taglineTriplet,
}: {
  config: Config;
  setConfig: (c: Config) => void;
  taglineTriplet: TaglineTriplet;
}) {
  const [showSettings, setShowSettings] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const scrollPosRef = useRef(0);
  const settingsScrollPosRef = useRef(0);
  const configEditorRef = useRef<ConfigEditorRef>(null);
  const generatorRef = useRef<GeneratorRef>(null);
  const mainRef = useRef<HTMLDivElement>(null);
  const settingsRef = useRef<HTMLDivElement>(null);

  // Close mobile menu on escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && mobileMenuOpen) {
        setMobileMenuOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mobileMenuOpen]);

  // Prevent body scroll when mobile menu is open
  useEffect(() => {
    if (mobileMenuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [mobileMenuOpen]);

  const openSettings = useCallback(() => {
    // Store main view scroll position
    scrollPosRef.current = window.scrollY;
    // Disable smooth scrolling temporarily
    document.documentElement.style.scrollBehavior = 'auto';
    
    // Trigger animation restart by briefly removing the animation
    if (settingsRef.current) {
      settingsRef.current.style.animation = 'none';
      // Force reflow
      settingsRef.current.offsetHeight;
      settingsRef.current.style.animation = '';
    }
    
    setShowSettings(true);
    
    // Restore settings scroll position after state update
    requestAnimationFrame(() => {
      window.scrollTo(0, settingsScrollPosRef.current);
      requestAnimationFrame(() => {
        document.documentElement.style.scrollBehavior = '';
      });
    });
  }, []);

  const closeSettings = useCallback((newConfig?: Config) => {
    if (newConfig) {
      setConfig(newConfig);
      // Re-check API keys availability without re-rendering
      generatorRef.current?.refreshAnalysisAvailability();
    }
    // Store settings scroll position
    settingsScrollPosRef.current = window.scrollY;
    // Disable smooth scrolling for instant restore
    document.documentElement.style.scrollBehavior = 'auto';
    
    // Trigger animation restart by briefly removing the animation
    if (mainRef.current) {
      mainRef.current.style.animation = 'none';
      // Force reflow
      mainRef.current.offsetHeight;
      mainRef.current.style.animation = '';
    }
    
    setShowSettings(false);
    
    // Restore main view scroll position after state update
    requestAnimationFrame(() => {
      window.scrollTo(0, scrollPosRef.current);
      requestAnimationFrame(() => {
        document.documentElement.style.scrollBehavior = '';
      });
    });
  }, [setConfig]);

  const handleMobileNavigation = (action: 'home' | SettingsTabId) => {
    setMobileMenuOpen(false);
    if (action === 'home') {
      if (showSettings) closeSettings();
    } else {
      // It's a settings tab - set it via ref and open settings
      configEditorRef.current?.setTab(action);
      if (!showSettings) openSettings();
    }
  };

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: 'var(--bg-base)' }}>
      {/* Header */}
      <header 
        className="sticky top-0 z-40 border-b backdrop-blur-md"
        style={{ 
          background: 'var(--header-bg)',
          borderColor: 'var(--header-border)',
        }}
      >
        <div className="header-container max-w-[1600px] mx-auto px-4 sm:px-6 py-4">
          <div className="flex items-center justify-between">
            {/* Logo & Title */}
            <div className="flex items-center gap-3">
              <div 
                className="header-logo w-10 h-10 rounded-xl flex items-center justify-center"
                style={{ 
                  background: 'linear-gradient(147deg, var(--accent-400), var(--accent-500))',
                  boxShadow: '0 0px 6px 0px var(--accent-500)'
                }}
              >
                <FileText size={22} className="header-logo-icon text-white" />
              </div>
              <div>
                <h1 
                  className="header-title text-xl font-bold"
                  style={{ color: 'var(--text-primary)' }}
                >
                  Personal Invoice Generator
                </h1>
                <p 
                  className="header-tagline text-xs font-medium"
                  style={{ color: 'var(--text-muted)' }}
                >
                  {formatTriplet(taglineTriplet)}
                </p>
              </div>
            </div>

            {/* Desktop Actions */}
            <div className="desktop-actions">
              {showSettings && (
                <button
                  onClick={() => configEditorRef.current?.save()}
                  className="btn btn-primary flex items-center gap-2"
                >
                  <Save size={18} />
                  <span>Save</span>
                </button>
              )}
              
              <button
                onClick={() => showSettings ? closeSettings() : openSettings()}
                className="btn btn-secondary flex items-center gap-2 transition-all"
              >
                <Settings size={18} className={showSettings ? 'animate-spin' : ''} style={{ animationDuration: '3s' }} />
                <span>Settings</span>
              </button>
            </div>

            {/* Mobile Menu Button */}
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="mobile-menu-btn"
              aria-label="Open menu"
            >
              <Menu size={24} />
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Sidebar */}
      <div 
        className={`mobile-sidebar-overlay ${mobileMenuOpen ? 'open' : ''}`}
        aria-hidden={!mobileMenuOpen}
      >
        <div 
          className="mobile-sidebar-backdrop" 
          onClick={() => setMobileMenuOpen(false)}
          aria-label="Close menu"
        />
        <div className="mobile-sidebar">
          <div className="mobile-sidebar-header">
            <h2 className="mobile-sidebar-title">Menu</h2>
            <button 
              className="mobile-sidebar-close"
              onClick={() => setMobileMenuOpen(false)}
              aria-label="Close menu"
            >
              <X size={20} />
            </button>
          </div>
          
          <div className="mobile-sidebar-content">
            <div className="mobile-sidebar-section">
              <div className="mobile-sidebar-section-title">Navigation</div>
              <nav className="mobile-sidebar-nav">
                <button
                  className={`mobile-sidebar-item ${!showSettings ? 'active' : ''}`}
                  onClick={() => handleMobileNavigation('home')}
                >
                  <Home size={18} className="mobile-sidebar-item-icon" />
                  <span>Generator</span>
                </button>
              </nav>
            </div>

            <div className="mobile-sidebar-section">
              <div className="mobile-sidebar-section-title">Settings</div>
              <nav className="mobile-sidebar-nav">
                {SETTINGS_TABS.map((tab) => {
                  const Icon = tab.icon;
                  return (
                    <button
                      key={tab.id}
                      className="mobile-sidebar-item"
                      onClick={() => handleMobileNavigation(tab.id)}
                    >
                      <Icon size={18} className="mobile-sidebar-item-icon" />
                      <span>{tab.label}</span>
                    </button>
                  );
                })}
              </nav>
            </div>
          </div>

          {showSettings && (
            <div className="mobile-sidebar-actions">
              <button
                onClick={() => {
                  configEditorRef.current?.save();
                  setMobileMenuOpen(false);
                }}
                className="btn btn-primary mobile-sidebar-btn"
              >
                <Save size={18} />
                <span>Save Settings</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Main Content */}
      <main className="flex-1">
        <div className="max-w-[1600px] mx-auto relative">
          {/* Generator - always mounted */}
          <div 
            ref={mainRef}
            className={`${showSettings ? 'hidden' : 'page-transition'}`}
          >
            <Generator ref={generatorRef} config={config} />
          </div>
          
          {/* Settings - always mounted */}
          <div 
            ref={settingsRef}
            className={`${showSettings ? 'page-transition' : 'hidden'}`}
          >
            <ConfigEditor
              ref={configEditorRef}
              config={config}
              onSave={(newConfig) => closeSettings(newConfig)}
              onCancel={() => closeSettings()}
              isVisible={showSettings}
            />
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer 
        className="border-t py-4 px-4 sm:px-6"
        style={{ 
          backgroundColor: 'var(--bg-surface)',
          borderColor: 'var(--border-default)'
        }}
      >
        <div className="max-w-[1600px] mx-auto flex items-center justify-between">
          <p 
            className="text-sm"
            style={{ color: 'var(--text-muted)' }}
          >
            © {new Date().getFullYear()} PIG — Personal Invoice Generator
          </p>
          <p 
            className="text-sm"
            style={{ color: 'var(--text-subtle)' }}
          >
            v0.1.0
          </p>
        </div>
      </footer>
    </div>
  );
}

function App() {
  const [config, setConfig] = useState<Config | null>(null);
  const [loading, setLoading] = useState(true);
  const [taglineTriplet] = useState<TaglineTriplet>(() =>
    pickRandomTriplet<TaglineTriplet>(TAGLINE_TRIPLETS, ['Infinite', 'Money', 'Glitch'])
  );

  useEffect(() => {
    loadConfig().then((c) => {
      setConfig(c);
      setLoading(false);
    });
  }, []);

  if (loading) {
    return (
      <div 
        className="flex flex-col items-center justify-center h-screen gap-4"
        style={{ backgroundColor: 'var(--bg-base)' }}
      >
        <div 
          className="w-16 h-16 rounded-2xl flex items-center justify-center animate-pulse"
          style={{ 
            background: 'linear-gradient(135deg, var(--accent-500), var(--accent-600))',
          }}
        >
          <FileText size={32} className="text-white" />
        </div>
        <div className="flex items-center gap-2" style={{ color: 'var(--text-muted)' }}>
          <Loader2 size={18} className="animate-spin" />
          <span className="text-sm font-medium">Loading configuration...</span>
        </div>
      </div>
    );
  }

  if (!config) {
    return (
      <div 
        className="flex flex-col items-center justify-center h-screen gap-4"
        style={{ backgroundColor: 'var(--bg-base)' }}
      >
        <div 
          className="w-16 h-16 rounded-2xl flex items-center justify-center"
          style={{ 
            background: 'linear-gradient(135deg, var(--error-500), var(--error-600))',
          }}
        >
          <FileText size={32} className="text-white" />
        </div>
        <p style={{ color: 'var(--error-500)' }} className="font-medium">
          Error loading configuration
        </p>
      </div>
    );
  }

  const handleThemeChange = (theme: Theme) => {
    saveTheme(theme as ThemePreference);
    setConfig({ ...config, theme: theme as ThemePreference });
  };

  return (
    <ThemeProvider 
      initialTheme={config.theme || 'system'} 
      onThemeChange={handleThemeChange}
    >
      <ConfirmModalProvider>
        <PromptModalProvider>
          <AppContent config={config} setConfig={setConfig} taglineTriplet={taglineTriplet} />
          <ThemedToaster />
        </PromptModalProvider>
      </ConfirmModalProvider>
    </ThemeProvider>
  );
}

function ThemedToaster() {
  const { resolvedTheme } = useTheme();
  return (
    <Toaster 
      theme={resolvedTheme === 'dark' ? 'dark' : 'light'}
      position="bottom-right"
      toastOptions={{
        style: {
          fontFamily: 'var(--font-sans)',
        },
      }}
    />
  );
}

export default App;
