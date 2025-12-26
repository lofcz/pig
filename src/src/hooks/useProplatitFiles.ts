import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { watch, UnwatchFn } from '@tauri-apps/plugin-fs';
import { join } from '@tauri-apps/api/path';
import { getProplatitFilesWithMetadata, FileEntryWithMetadata } from '../utils/logic';
import { Config, Currency, ProjectStructure, DEFAULT_PROJECT_STRUCTURE } from '../types';

/**
 * File identity signature based on size and modification time.
 * Used to detect if a file has changed since last seen.
 */
export interface FileIdentity {
  /** File size in bytes */
  size: number;
  /** File modification time as ISO string (or timestamp) */
  mtime: string;
}

/**
 * User-editable state for an extra item that should be preserved across refreshes.
 */
export interface ExtraItemUserState {
  value: number;
  currency: Currency;
  selected: boolean;
  assignedDraftId?: string;
}

/**
 * Stored state for an extra item, including file identity for change detection.
 */
interface StoredItemState {
  /** File identity when this state was last saved */
  identity: FileIdentity;
  /** User state to restore */
  state: ExtraItemUserState;
}

export interface ProplatitItem {
  file: FileEntryWithMetadata;
  value: number;
  currency: Currency;
  selected: boolean;
  assignedDraftId?: string;
}

interface UseProplatitFilesOptions {
  rootPath: string;
  primaryCurrency: Currency;
  exchangeRates: Config['exchangeRates'];
  projectStructure?: ProjectStructure;
}

/**
 * Generate a file identity signature for change detection.
 * Similar to how git detects file changes (size + mtime).
 */
function getFileIdentity(file: FileEntryWithMetadata): FileIdentity {
  return {
    size: file.size,
    mtime: file.mtime,
  };
}

/**
 * Check if two file identities match (file unchanged).
 */
function identitiesMatch(a: FileIdentity, b: FileIdentity): boolean {
  return a.size === b.size && a.mtime === b.mtime;
}

/**
 * Hook for managing proplatit (extra) files state.
 * Preserves user state (price, currency, selection) across refreshes.
 * Resets state when file content changes (detected via size + mtime).
 * Automatically watches the folder for changes and refreshes the file list.
 */
export function useProplatitFiles({ 
  rootPath, 
  primaryCurrency, 
  exchangeRates,
  projectStructure = DEFAULT_PROJECT_STRUCTURE,
}: UseProplatitFilesOptions) {
  const [files, setFiles] = useState<ProplatitItem[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Persistent storage for user state, keyed by file path
  // Stores both the file identity (for change detection) and user state
  const stateMapRef = useRef<Map<string, StoredItemState>>(new Map());
  
  // Flag to pause file watching during our own file operations
  const watchPausedRef = useRef(false);
  
  // Track if initial load has completed
  const initialLoadDoneRef = useRef(false);
  
  // Track if a load is already in progress to avoid concurrent loads
  const loadingRef = useRef(false);

  const loadFiles = useCallback(async () => {
    // Prevent concurrent loads
    if (loadingRef.current) return;
    loadingRef.current = true;
    
    // Only show loading state on initial load (when we have no data yet)
    const isInitialLoad = !initialLoadDoneRef.current;
    if (isInitialLoad) {
      setLoading(true);
    }
    
    try {
      const loadedFiles = await getProplatitFilesWithMetadata(rootPath, projectStructure);
      const stateMap = stateMapRef.current;
      
      setFiles(loadedFiles.map(f => {
        const storedState = stateMap.get(f.path);
        const currentIdentity = getFileIdentity(f);
        
        // Check if we have stored state AND the file hasn't changed
        if (storedState && identitiesMatch(storedState.identity, currentIdentity)) {
          // Restore previous user state
          return {
            file: f,
            value: storedState.state.value,
            currency: storedState.state.currency,
            selected: storedState.state.selected,
            assignedDraftId: storedState.state.assignedDraftId,
          };
        }
        
        // New file or file changed - use defaults and clear any stale state
        if (storedState) {
          // File identity changed - remove stale state
          stateMap.delete(f.path);
        }
        
        return {
          file: f,
          value: 0,
          currency: primaryCurrency,
          selected: false,
          assignedDraftId: undefined,
        };
      }));
      
      // Clean up state map: remove entries for files that no longer exist
      const currentPaths = new Set(loadedFiles.map(f => f.path));
      for (const path of stateMap.keys()) {
        if (!currentPaths.has(path)) {
          stateMap.delete(path);
        }
      }
      
      initialLoadDoneRef.current = true;
    } finally {
      setLoading(false);
      loadingRef.current = false;
    }
  }, [rootPath, primaryCurrency, projectStructure]);

  // Initial load
  useEffect(() => {
    loadFiles();
  }, [loadFiles]);

  // File watcher setup
  useEffect(() => {
    let unwatchFn: UnwatchFn | null = null;
    let isActive = true;

    const setupWatcher = async () => {
      try {
        const watchPath = await join(rootPath, projectStructure.reimbursePendingFolder);
        
        // Use debounced watch to avoid rapid-fire events
        // delayMs of 500ms groups rapid changes together
        unwatchFn = await watch(
          watchPath,
          (event) => {
            // Ignore events while paused (during our own file operations)
            if (watchPausedRef.current || !isActive) return;
            
            // Only react to file changes (create, modify, remove)
            // The event.type can be 'any', { access: ... }, { create: ... }, { modify: ... }, { remove: ... }, or 'other'
            const eventType = event.type;
            if (
              eventType === 'any' ||
              eventType === 'other' ||
              (typeof eventType === 'object' && ('create' in eventType || 'modify' in eventType || 'remove' in eventType))
            ) {
              // Trigger a reload
              loadFiles();
            }
          },
          { 
            recursive: false,  // Only watch the immediate folder
            delayMs: 500,      // Debounce delay
          }
        );
      } catch (err) {
        // Folder might not exist yet, that's OK
        console.warn('Failed to set up file watcher for extra items:', err);
      }
    };

    setupWatcher();

    // Cleanup on unmount or when dependencies change
    return () => {
      isActive = false;
      if (unwatchFn) {
        unwatchFn();
      }
    };
  }, [rootPath, projectStructure.reimbursePendingFolder, loadFiles]);

  /**
   * Pause file watching. Call this before performing file operations
   * that would trigger unwanted reloads.
   */
  const pauseWatching = useCallback(() => {
    watchPausedRef.current = true;
  }, []);

  /**
   * Resume file watching after pausing.
   */
  const resumeWatching = useCallback(() => {
    watchPausedRef.current = false;
  }, []);

  const updateItem = useCallback((
    index: number,
    value: number,
    currency: Currency,
    selected: boolean
  ) => {
    setFiles(prev => prev.map((item, idx) => {
      if (idx !== index) return item;
      
      const updatedItem = { ...item, value, currency, selected };
      
      // Store user state with current file identity for later restoration
      stateMapRef.current.set(item.file.path, {
        identity: getFileIdentity(item.file),
        state: {
          value,
          currency,
          selected,
          assignedDraftId: item.assignedDraftId,
        },
      });
      
      return updatedItem;
    }));
  }, []);

  const totalValue = useMemo(() => {
    return files.filter(p => p.selected).reduce((sum, p) => {
      let val = p.value;
      // Convert from item's currency to primary currency
      if (p.currency !== primaryCurrency) {
        // First convert to the base (using exchange rate), then account for primary currency rate
        val = val * exchangeRates[p.currency] / exchangeRates[primaryCurrency];
      }
      return sum + val;
    }, 0);
  }, [files, exchangeRates, primaryCurrency]);

  const selectedFiles = useMemo(() => 
    files.filter(p => p.selected),
    [files]
  );

  return {
    files,
    setFiles,
    loading,
    loadFiles,
    updateItem,
    totalValue,
    selectedFiles,
    pauseWatching,
    resumeWatching,
  };
}

