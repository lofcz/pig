import { useEffect, useState, useRef, useCallback } from 'react';
import { getVersion } from '@tauri-apps/api/app';
import { loadConfigFromPath, saveConfig } from './utils/config';
import { loadSmtpCredentials } from './utils/smtpCredentials';
import { loadGlobalSettings, saveGlobalSettings, GlobalSettings } from './utils/globalSettings';
import { Config } from './types';
import { useProjectStore } from './hooks';
import Generator, { GeneratorRef } from './components/Generator';
import ConfigEditor, { ConfigEditorRef, SETTINGS_TABS, SettingsTabId } from './components/ConfigEditor';
import ProjectPicker from './components/ProjectPicker';
import { ThemeProvider, useTheme } from './contexts/ThemeContext';
import { ModalProvider } from './contexts/ModalContext';
import { ProjectWatcherProvider } from './contexts/ProjectWatcherContext';
import { MissingFilesModal } from './components/modals/MissingFilesModal';
import { Toaster, toast } from 'sonner';
import { open } from '@tauri-apps/plugin-dialog';
import { FileText, Settings, Save, Loader2, Menu, X, Home, FolderOpen } from 'lucide-react';
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
  onCloseProject,
}: {
  config: Config;
  setConfig: (c: Config) => void;
  taglineTriplet: TaglineTriplet;
  onCloseProject: () => void;
}) {
  const [showSettings, setShowSettings] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [appVersion, setAppVersion] = useState('');
  const scrollPosRef = useRef(0);
  const settingsScrollPosRef = useRef(0);
  const configEditorRef = useRef<ConfigEditorRef>(null);
  const generatorRef = useRef<GeneratorRef>(null);
  const mainRef = useRef<HTMLDivElement>(null);
  const settingsRef = useRef<HTMLDivElement>(null);

  // Fetch app version on mount
  useEffect(() => {
    getVersion().then(setAppVersion).catch(() => setAppVersion('?.?.?'));
  }, []);

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

  const handleMobileNavigation = (action: 'home' | 'projects' | SettingsTabId) => {
    setMobileMenuOpen(false);
    if (action === 'home') {
      if (showSettings) closeSettings();
    } else if (action === 'projects') {
      onCloseProject();
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
                  {config.projectName || 'Personal Invoice Generator'}
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
              <button
                onClick={onCloseProject}
                className="btn btn-secondary flex items-center gap-2"
                title="Switch project"
              >
                <FolderOpen size={18} />
                <span className="hidden lg:inline">Projects</span>
              </button>

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
                <button
                  className="mobile-sidebar-item"
                  onClick={() => handleMobileNavigation('projects')}
                >
                  <FolderOpen size={18} className="mobile-sidebar-item-icon" />
                  <span>Switch Project</span>
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
            © {new Date().getFullYear()} <a href="https://github.com/lofcz" target='_blank'>Matěj Štágl</a>
          </p>
          <p 
            className="text-sm"
            style={{ color: 'var(--text-subtle)' }}
          >
            PIG v{appVersion}{import.meta.env.DEV ? ' [dev]' : ''}
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
  
  // Load global settings (theme) once on mount
  const globalSettings = loadGlobalSettings();

  const {
    store,
    activeProject,
    isValidating,
    removeProject,
    setActive,
    closeProject,
    createProject,
    openExistingRepository,
    updateName,
    relocateProject,
  } = useProjectStore();

  // Load config function (extracted so it can be called on integrity restore)
  const loadProjectConfig = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);
    
    if (!activeProject) {
      setConfig(null);
      setLoading(false);
      return;
    }
    
    try {
      const [c, credentials] = await Promise.all([
        loadConfigFromPath(activeProject.path),
        loadSmtpCredentials(activeProject.path),
      ]);
      
      // Migrate legacy theme/sofficePath to global settings if present
      const currentGlobalSettings = loadGlobalSettings();
      let needsGlobalSave = false;
      const newGlobalSettings: GlobalSettings = { ...currentGlobalSettings };
      
      if (c.theme && currentGlobalSettings.theme === 'system') {
        // Only migrate if global settings are at default
        newGlobalSettings.theme = c.theme;
        needsGlobalSave = true;
      }
      
      if (c.sofficePath && !currentGlobalSettings.sofficePath) {
        // Only migrate if global settings don't have a path set
        newGlobalSettings.sofficePath = c.sofficePath;
        needsGlobalSave = true;
      }
      
      if (needsGlobalSave) {
        saveGlobalSettings(newGlobalSettings);
        // Apply theme immediately
        const root = document.documentElement;
        if (newGlobalSettings.theme === 'system') {
          const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
          root.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
        } else {
          root.setAttribute('data-theme', newGlobalSettings.theme);
        }
      }
      
      // Merge SMTP passwords into connectors
      if (c.emailConnectors) {
        c.emailConnectors = c.emailConnectors.map(connector => ({
          ...connector,
          password: credentials[connector.id] || connector.password || ''
        }));
      }
      
      // If config has a project name and it differs from stored, update the store
      if (c.projectName && c.projectName !== activeProject.name) {
        updateName(activeProject.id, c.projectName);
      }
      
      // Ensure project name is set (fallback to stored name)
      if (!c.projectName) {
        c.projectName = activeProject.name;
      }
      
      console.log('App: Config loaded for', activeProject.path);
      setConfig(c);
    } catch (e) {
      console.error("Failed to load project config:", e);
      setConfig(null);
    }
    
    setLoading(false);
  }, [activeProject, updateName]);

  // Load config when active project changes
  useEffect(() => {
    loadProjectConfig();
  }, [loadProjectConfig]);
  
  // Handler for integrity restoration - show loading state immediately, then reload
  const handleIntegrityRestored = useCallback(() => {
    console.log('App: Integrity restored, reloading config');
    // Set loading first to show spinner immediately (prevents flash of stale data)
    setLoading(true);
    setConfig(null);
    // Then reload
    loadProjectConfig(true);
  }, [loadProjectConfig]);

  // Auto-save config when it changes
  const handleConfigChange = useCallback((newConfig: Config) => {
    setConfig(newConfig);
    // Save to file
    saveConfig(newConfig).catch(e => console.error("Failed to auto-save config:", e));
  }, []);

  // Handle project close (return to picker)
  const handleCloseProject = useCallback(() => {
    closeProject();
    setConfig(null);
  }, [closeProject]);

  // Handle relocating the active project
  const handleRelocateActiveProject = useCallback(async () => {
    if (!activeProject) return;
    
    const selected = await open({
      directory: true,
      multiple: false,
      title: 'Select New Project Location',
    });
    
    if (selected && typeof selected === 'string') {
      const result = await relocateProject(activeProject.id, selected);
      if (result.success) {
        toast.success('Project relocated successfully');
        // Reload config from new path
        setLoading(true);
        setConfig(null);
        loadProjectConfig(true);
      } else {
        toast.error(result.error || 'Not a PIG repository');
      }
    }
  }, [activeProject, relocateProject, loadProjectConfig]);

  // Handle relocating a project from project picker
  const handleRelocateProject = useCallback(async (projectId: string) => {
    const selected = await open({
      directory: true,
      multiple: false,
      title: 'Select New Project Location',
    });
    
    if (selected && typeof selected === 'string') {
      const result = await relocateProject(projectId, selected);
      if (result.success) {
        toast.success('Project relocated successfully');
      } else {
        toast.error(result.error || 'Not a PIG repository');
      }
      return result;
    }
    return { success: false, error: 'No folder selected' };
  }, [relocateProject]);

  // Handle opening a recent project
  const handleOpenRecentProject = useCallback((project: typeof store.recentProjects[0]) => {
    if (project.isValid !== false) {
      setActive(project.id);
    }
  }, [setActive]);

  if (loading) {
    return (
      <ThemeProvider initialTheme={globalSettings.theme}>
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
            <span className="text-sm font-medium">
              {activeProject ? 'Loading project...' : 'Initializing...'}
            </span>
          </div>
        </div>
      </ThemeProvider>
    );
  }

  // No active project - show project picker
  if (!activeProject) {
    return (
      <ThemeProvider initialTheme={globalSettings.theme}>
        <ModalProvider>
          <ProjectPicker
            recentProjects={store.recentProjects}
            isValidating={isValidating}
            onOpenProject={handleOpenRecentProject}
            onRemoveProject={removeProject}
            onCreateProject={createProject}
            onOpenExisting={openExistingRepository}
            onRelocateProject={handleRelocateProject}
          />
          <ThemedToaster />
        </ModalProvider>
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider initialTheme={globalSettings.theme}>
      <ModalProvider>
        <ProjectWatcherProvider rootPath={activeProject.path} onIntegrityRestored={handleIntegrityRestored}>
          {config ? (
            <AppContent 
              config={config} 
              setConfig={handleConfigChange} 
              taglineTriplet={taglineTriplet}
              onCloseProject={handleCloseProject}
            />
          ) : (
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
                Configuration unavailable
              </p>
            </div>
          )}
          <ThemedToaster />
          <MissingFilesModal 
            rootPath={activeProject.path} 
            onRelocate={handleRelocateActiveProject}
            onClose={handleCloseProject}
          />
        </ProjectWatcherProvider>
      </ModalProvider>
    </ThemeProvider>
  );
}

function ThemedToaster() {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';
  
  return (
    <Toaster 
      theme={isDark ? 'dark' : 'light'}
      position="bottom-right"
      toastOptions={{
        style: {
          fontFamily: 'var(--font-sans)',
          background: isDark ? '#1a2035' : '#ffffff',
          border: `1px solid ${isDark ? '#2a3347' : '#e2e8f0'}`,
          color: isDark ? '#e2e8f0' : '#1e293b',
          borderRadius: '12px',
        },
        classNames: {
          success: isDark ? 'toast-success-dark' : 'toast-success-light',
          error: isDark ? 'toast-error-dark' : 'toast-error-light',
        },
      }}
    />
  );
}

export default App;
