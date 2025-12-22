/**
 * Project Store - Manages recent projects and active project state
 * 
 * Uses localStorage for persistence across sessions
 */

import { exists } from '@tauri-apps/plugin-fs';
import {
  ProjectStore,
  RecentProject,
  DEFAULT_PROJECT_STORE,
} from '../types/project';
import { validateRepository } from './repository';

const STORE_KEY = 'pig_project_store';
const MAX_RECENT_PROJECTS = 10;

/**
 * Load the project store from localStorage
 */
export function loadProjectStore(): ProjectStore {
  try {
    const stored = localStorage.getItem(STORE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return {
        ...DEFAULT_PROJECT_STORE,
        ...parsed,
      };
    }
  } catch (error) {
    console.warn('Failed to load project store:', error);
  }
  return { ...DEFAULT_PROJECT_STORE };
}

/**
 * Save the project store to localStorage
 */
export function saveProjectStore(store: ProjectStore): void {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(store));
  } catch (error) {
    console.error('Failed to save project store:', error);
  }
}

/**
 * Add or update a project in the recent projects list
 */
export function addRecentProject(
  store: ProjectStore,
  project: Omit<RecentProject, 'lastOpened' | 'isValid'>
): ProjectStore {
  const now = new Date().toISOString();
  
  // Remove existing entry for this path (case-insensitive on Windows)
  const normalizedPath = project.path.toLowerCase();
  const filtered = store.recentProjects.filter(
    p => p.path.toLowerCase() !== normalizedPath
  );
  
  // Add new entry at the beginning
  const newProject: RecentProject = {
    ...project,
    lastOpened: now,
    isValid: true,
  };
  
  const recentProjects = [newProject, ...filtered].slice(0, MAX_RECENT_PROJECTS);
  
  return {
    ...store,
    activeProjectId: project.id,
    recentProjects,
  };
}

/**
 * Remove a project from the recent projects list
 */
export function removeRecentProject(store: ProjectStore, projectId: string): ProjectStore {
  const recentProjects = store.recentProjects.filter(p => p.id !== projectId);
  
  return {
    ...store,
    activeProjectId: store.activeProjectId === projectId ? null : store.activeProjectId,
    recentProjects,
  };
}

/**
 * Set the active project
 */
export function setActiveProject(store: ProjectStore, projectId: string | null): ProjectStore {
  return {
    ...store,
    activeProjectId: projectId,
  };
}

/**
 * Get the active project from the store
 */
export function getActiveProject(store: ProjectStore): RecentProject | null {
  if (!store.activeProjectId) return null;
  return store.recentProjects.find(p => p.id === store.activeProjectId) || null;
}

/**
 * Validate all recent projects and update their validity status and names
 */
export async function validateRecentProjects(store: ProjectStore): Promise<ProjectStore> {
  const validatedProjects: RecentProject[] = await Promise.all(
    store.recentProjects.map(async (project) => {
      try {
        const pathExists = await exists(project.path);
        if (!pathExists) {
          return { ...project, isValid: false };
        }
        
        const validation = await validateRepository(project.path);
        return {
          ...project,
          // Update name from config if available
          name: validation.projectName || project.name,
          isValid: validation.isValid,
          isGitRepo: validation.isGitRepo,
        };
      } catch {
        return { ...project, isValid: false };
      }
    })
  );
  
  return {
    ...store,
    recentProjects: validatedProjects,
  };
}

/**
 * Generate a unique project ID
 */
export function generateProjectId(): string {
  return `project_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Clear the active project (return to project picker)
 */
export function clearActiveProject(store: ProjectStore): ProjectStore {
  return {
    ...store,
    activeProjectId: null,
  };
}

/**
 * Update a project's name in the store
 */
export function updateProjectName(store: ProjectStore, projectId: string, newName: string): ProjectStore {
  const recentProjects = store.recentProjects.map(p => 
    p.id === projectId ? { ...p, name: newName } : p
  );
  
  return {
    ...store,
    recentProjects,
  };
}

/**
 * Hook-friendly wrapper for project store operations
 */
export class ProjectStoreManager {
  private store: ProjectStore;
  private listeners: Set<(store: ProjectStore) => void> = new Set();

  constructor() {
    this.store = loadProjectStore();
  }

  getStore(): ProjectStore {
    return this.store;
  }

  private update(newStore: ProjectStore) {
    this.store = newStore;
    saveProjectStore(newStore);
    this.listeners.forEach(listener => listener(newStore));
  }

  subscribe(listener: (store: ProjectStore) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  addRecent(project: Omit<RecentProject, 'lastOpened' | 'isValid'>) {
    this.update(addRecentProject(this.store, project));
  }

  remove(projectId: string) {
    this.update(removeRecentProject(this.store, projectId));
  }

  setActive(projectId: string | null) {
    this.update(setActiveProject(this.store, projectId));
  }

  clearActive() {
    this.update(clearActiveProject(this.store));
  }

  async validateAll(): Promise<void> {
    const validated = await validateRecentProjects(this.store);
    this.update(validated);
  }

  getActive(): RecentProject | null {
    return getActiveProject(this.store);
  }
}

// Singleton instance
let storeManagerInstance: ProjectStoreManager | null = null;

export function getProjectStoreManager(): ProjectStoreManager {
  if (!storeManagerInstance) {
    storeManagerInstance = new ProjectStoreManager();
  }
  return storeManagerInstance;
}

