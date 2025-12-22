/**
 * React hook for managing project store state
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ProjectStore,
  RecentProject,
  ProjectStructure,
  DEFAULT_PROJECT_STRUCTURE,
} from '../types/project';
import {
  loadProjectStore,
  saveProjectStore,
  addRecentProject,
  removeRecentProject,
  setActiveProject,
  clearActiveProject,
  getActiveProject,
  validateRecentProjects,
  generateProjectId,
  updateProjectName,
} from '../utils/projectStore';
import { validateRepository, scaffoldRepository } from '../utils/repository';

export interface UseProjectStoreResult {
  /** Current project store state */
  store: ProjectStore;
  /** Currently active project (if any) */
  activeProject: RecentProject | null;
  /** Whether projects are being validated */
  isValidating: boolean;
  /** Add a project to recent and set as active */
  openProject: (path: string, name: string, isGitRepo?: boolean) => void;
  /** Remove a project from recent list */
  removeProject: (projectId: string) => void;
  /** Set active project by ID */
  setActive: (projectId: string | null) => void;
  /** Clear active project (go to project picker) */
  closeProject: () => void;
  /** Validate all recent projects */
  validateProjects: () => Promise<void>;
  /** Scaffold and open a new project */
  createProject: (path: string, name: string, structure?: ProjectStructure) => Promise<void>;
  /** Open an existing valid PIG repository */
  openExistingRepository: (path: string) => Promise<{ success: boolean; error?: string }>;
  /** Update a project's name in the store */
  updateName: (projectId: string, newName: string) => void;
}

export function useProjectStore(): UseProjectStoreResult {
  const [store, setStore] = useState<ProjectStore>(() => loadProjectStore());
  const [isValidating, setIsValidating] = useState(false);

  // Save store whenever it changes
  useEffect(() => {
    saveProjectStore(store);
  }, [store]);

  const activeProject = useMemo(() => getActiveProject(store), [store]);

  const openProject = useCallback((
    path: string,
    name: string,
    isGitRepo: boolean = false
  ) => {
    const project: Omit<RecentProject, 'lastOpened' | 'isValid'> = {
      id: generateProjectId(),
      name,
      path,
      isGitRepo,
    };
    setStore(prev => addRecentProject(prev, project));
  }, []);

  const removeProject = useCallback((projectId: string) => {
    setStore(prev => removeRecentProject(prev, projectId));
  }, []);

  const setActive = useCallback((projectId: string | null) => {
    setStore(prev => setActiveProject(prev, projectId));
  }, []);

  const closeProject = useCallback(() => {
    setStore(prev => clearActiveProject(prev));
  }, []);

  const validateProjects = useCallback(async () => {
    setIsValidating(true);
    try {
      const validated = await validateRecentProjects(store);
      setStore(validated);
    } finally {
      setIsValidating(false);
    }
  }, [store]);

  const createProject = useCallback(async (
    path: string,
    name: string,
    structure: ProjectStructure = DEFAULT_PROJECT_STRUCTURE
  ) => {
    // Scaffold the repository
    await scaffoldRepository(path, name, structure);
    
    // Open the new project
    openProject(path, name, false);
  }, [openProject]);

  const openExistingRepository = useCallback(async (path: string): Promise<{ success: boolean; error?: string }> => {
    const validation = await validateRepository(path);
    
    if (!validation.isValid) {
      return {
        success: false,
        error: validation.error || 'Invalid PIG repository',
      };
    }
    
    openProject(path, validation.projectName || 'Unnamed Project', validation.isGitRepo);
    return { success: true };
  }, [openProject]);

  const updateName = useCallback((projectId: string, newName: string) => {
    setStore(prev => updateProjectName(prev, projectId, newName));
  }, []);

  // Validate projects on mount
  useEffect(() => {
    validateProjects();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    store,
    activeProject,
    isValidating,
    openProject,
    removeProject,
    setActive,
    closeProject,
    validateProjects,
    createProject,
    openExistingRepository,
    updateName,
  };
}

