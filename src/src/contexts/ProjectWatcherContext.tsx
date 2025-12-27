import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { exists } from '@tauri-apps/plugin-fs';
import { dirname, join } from '@tauri-apps/api/path';

export interface WatcherEvent {
  path: string;
  kind: string; // "create" | "modify" | "remove" | "rename" | "error"
}

type WatcherCallback = (event: WatcherEvent) => void;

interface ProjectWatcherContextType {
  isIntegrityLost: boolean;
  /** Increments when integrity is restored - use as dependency to trigger reloads */
  integrityRestoredCount: number;
  subscribe: (callback: WatcherCallback) => () => void;
}

const ProjectWatcherContext = createContext<ProjectWatcherContextType>({
  isIntegrityLost: false,
  integrityRestoredCount: 0,
  subscribe: () => () => {},
});

export const useProjectWatcher = () => useContext(ProjectWatcherContext);

interface ProjectWatcherProviderProps {
  children: React.ReactNode;
  rootPath: string | null;
  onIntegrityRestored?: () => void;
}

export const ProjectWatcherProvider: React.FC<ProjectWatcherProviderProps> = ({ children, rootPath, onIntegrityRestored }) => {
  const [isIntegrityLost, setIsIntegrityLost] = useState(false);
  const [integrityRestoredCount, setIntegrityRestoredCount] = useState(0);
  const wasIntegrityLostRef = useRef(false);
  const subscribersRef = useRef<Set<WatcherCallback>>(new Set());
  const validationInProgressRef = useRef(false);
  
  // Watcher state
  const watcherRef = useRef<{
    unlisten: UnlistenFn | null;
    watchedPath: string | null;
  }>({ unlisten: null, watchedPath: null });

  // Update integrity state and track restorations
  const updateIntegrityState = (lost: boolean) => {
    // Detect restoration (was lost, now not lost)
    if (wasIntegrityLostRef.current && !lost) {
      console.log('ProjectWatcher: Integrity RESTORED - triggering reload');
      setIntegrityRestoredCount(c => c + 1);
      // Call the callback to reload config at App level
      onIntegrityRestored?.();
    }
    wasIntegrityLostRef.current = lost;
    setIsIntegrityLost(lost);
  };

  // Validation function - checks for .pig/cfg.json only
  const validateIntegrity = async (path: string): Promise<boolean> => {
    try {
      // First check if the directory exists
      const rootExists = await exists(path);
      if (!rootExists) return false;
      
      // Check for .pig/cfg.json
      const configPath = await join(path, '.pig', 'cfg.json');
      const configExists = await exists(configPath);
      
      return configExists;
    } catch (e) {
      console.error('Integrity validation failed:', e);
      return false;
    }
  };

  // Initial integrity check only (no polling)
  useEffect(() => {
    if (!rootPath) {
      updateIntegrityState(false);
      return;
    }
    
    validateIntegrity(rootPath).then(isValid => {
      console.log('ProjectWatcherProvider: Initial validation result:', isValid);
      updateIntegrityState(!isValid);
    });
  }, [rootPath]);

  useEffect(() => {
    if (!rootPath) {
      return;
    }

    const cleanupWatcher = async () => {
      const w = watcherRef.current;
      if (w.unlisten) {
        w.unlisten();
        w.unlisten = null;
      }
      if (w.watchedPath) {
        await invoke('unwatch_path', { path: w.watchedPath }).catch(console.error);
        w.watchedPath = null;
      }
    };

    const setupWatcher = async () => {
      // Use stable event name based on path (not timestamp) to survive React strict mode
      const parentPath = await dirname(rootPath);
      const eventName = `project-watch-${parentPath.replace(/[^a-zA-Z0-9]/g, '-')}`;

      try {
        console.log('Setting up watcher on:', parentPath, 'with event:', eventName);
        
        // Get project folder name for matching
        const projectFolderName = rootPath.replace(/\\/g, '/').split('/').pop()?.toLowerCase() || '';
        
        // Setup listener
        const unlisten = await listen<WatcherEvent>(eventName, (event) => {
          const { payload } = event;
          
          if (payload.kind === 'error') {
            console.warn('Project watcher error:', payload.path);
            return;
          }

          // Normalize paths for comparison
          const normalizedPayloadPath = payload.path.replace(/\\/g, '/').toLowerCase();
          const normalizedRootPath = rootPath.replace(/\\/g, '/').toLowerCase();
          
          // Check if event is related to project directory or files inside it:
          // 1. Event path starts with project root (files inside project)
          // 2. Event path IS the project root (project folder itself)
          // 3. Event involves the project folder name (for rename detection)
          const isInsideProject = normalizedPayloadPath.startsWith(normalizedRootPath + '/');
          const isProjectFolder = normalizedPayloadPath === normalizedRootPath;
          const involvesProjectName = normalizedPayloadPath.endsWith('/' + projectFolderName) ||
                                       normalizedPayloadPath.includes('/' + projectFolderName + '/');
          
          const isProjectRelated = isInsideProject || isProjectFolder || involvesProjectName;
          
          // Always validate on any project-related change
          if (isProjectRelated) {
            // Debounce validation
            if (!validationInProgressRef.current) {
              validationInProgressRef.current = true;
              
              console.log('ProjectWatcher: Change detected:', payload.path, payload.kind);
              
              validateIntegrity(rootPath).then(isValid => {
                console.log('ProjectWatcher: Integrity:', isValid);
                updateIntegrityState(!isValid);
              }).finally(() => {
                setTimeout(() => {
                  validationInProgressRef.current = false;
                }, 300);
              });
            }
          }

          // Notify ALL subscribers (they do their own filtering)
          subscribersRef.current.forEach(cb => cb(payload));
        });

        watcherRef.current.unlisten = unlisten;
        watcherRef.current.watchedPath = parentPath;

        // Watch parent directory RECURSIVELY
        // FILE_SHARE_DELETE in our custom watcher allows folder renaming
        await invoke('watch_path', {
          path: parentPath,
          recursive: true,
          eventName: eventName
        });
        
        console.log('Watcher setup complete on:', parentPath);
        
      } catch (e) {
        console.error('Failed to setup project watcher:', e);
      }
    };

    cleanupWatcher().then(() => setupWatcher());

    return () => {
      cleanupWatcher();
    };
  }, [rootPath]);

  const subscribe = (callback: WatcherCallback) => {
    subscribersRef.current.add(callback);
    return () => {
      subscribersRef.current.delete(callback);
    };
  };

  return (
    <ProjectWatcherContext.Provider value={{ isIntegrityLost, integrityRestoredCount, subscribe }}>
      {children}
    </ProjectWatcherContext.Provider>
  );
};
