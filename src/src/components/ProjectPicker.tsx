/**
 * ProjectPicker - Empty state shown when no project is active
 * 
 * Displays:
 * - Open project button
 * - List of recent projects with validity indicators
 */

import { useState } from 'react';
import {
  FolderOpen,
  Clock,
  Trash2,
  AlertCircle,
  CheckCircle2,
  GitBranch,
  FileText,
  ArrowRight,
  Loader2,
  FolderPlus,
} from 'lucide-react';
import { open } from '@tauri-apps/plugin-dialog';
import { RecentProject, ProjectStructure } from '../types/project';
import { validateRepository } from '../utils/repository';
import { OnboardingModal } from './OnboardingModal';

interface ProjectPickerProps {
  recentProjects: RecentProject[];
  isValidating: boolean;
  onOpenProject: (project: RecentProject) => void;
  onRemoveProject: (projectId: string) => void;
  onCreateProject: (path: string, name: string, structure: ProjectStructure) => Promise<void>;
  onOpenExisting: (path: string) => Promise<{ success: boolean; error?: string }>;
}

export function ProjectPicker({
  recentProjects,
  isValidating,
  onOpenProject,
  onRemoveProject,
  onCreateProject,
  onOpenExisting,
}: ProjectPickerProps) {
  const [isOpening, setIsOpening] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [selectedPath, setSelectedPath] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  const handleOpenFolder = async () => {
    setIsOpening(true);
    setError(null);
    
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: 'Select Project Folder',
      });
      
      if (selected && typeof selected === 'string') {
        // Validate if it's a PIG repository
        const validation = await validateRepository(selected);
        
        if (validation.isValid) {
          // Open existing project
          const result = await onOpenExisting(selected);
          if (!result.success) {
            setError(result.error || 'Failed to open project');
          }
        } else {
          // Show onboarding modal
          setSelectedPath(selected);
          setShowOnboarding(true);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to open folder');
    } finally {
      setIsOpening(false);
    }
  };

  const handleOnboardingConfirm = async (name: string, structure: ProjectStructure) => {
    await onCreateProject(selectedPath, name, structure);
    setShowOnboarding(false);
    setSelectedPath('');
  };

  const handleOnboardingCancel = () => {
    setShowOnboarding(false);
    setSelectedPath('');
  };

  const formatDate = (isoString: string) => {
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
    return date.toLocaleDateString();
  };

  return (
    <div 
      className="min-h-screen flex flex-col items-center justify-center p-4"
      style={{ backgroundColor: 'var(--bg-base)' }}
    >
      <div className="w-full max-w-2xl">
        {/* Hero Section */}
        <div className="text-center mb-12">
          <div 
            className="w-20 h-20 rounded-2xl mx-auto mb-6 flex items-center justify-center"
            style={{ 
              background: 'linear-gradient(135deg, var(--accent-500), var(--accent-600))',
              boxShadow: '0 8px 32px -8px var(--accent-500)',
            }}
          >
            <FileText size={40} className="text-white" />
          </div>
          
          <h1 
            className="text-3xl font-bold mb-2"
            style={{ color: 'var(--text-primary)' }}
          >
            Personal Invoice Generator
          </h1>
          <p 
            className="text-lg"
            style={{ color: 'var(--text-muted)' }}
          >
            Open an existing project or create a new one
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-4 mb-8">
          <button
            onClick={handleOpenFolder}
            disabled={isOpening}
            className="btn btn-primary flex-1 py-4 text-base flex items-center justify-center gap-3"
          >
            {isOpening ? (
              <>
                <Loader2 size={20} className="animate-spin" />
                <span>Opening...</span>
              </>
            ) : (
              <>
                <FolderOpen size={20} />
                <span>Open Project</span>
              </>
            )}
          </button>
        </div>

        {/* Error Message */}
        {error && (
          <div 
            className="mb-6 px-4 py-3 rounded-xl flex items-center gap-3"
            style={{ 
              backgroundColor: 'var(--error-50)',
              color: 'var(--error-600)',
            }}
          >
            <AlertCircle size={18} />
            <span className="text-sm">{error}</span>
          </div>
        )}

        {/* Recent Projects */}
        {recentProjects.length > 0 && (
          <div 
            className="rounded-2xl overflow-hidden"
            style={{ 
              backgroundColor: 'var(--bg-surface)',
              border: '1px solid var(--border-default)',
            }}
          >
            <div 
              className="px-5 py-4 flex items-center gap-2"
              style={{ 
                borderBottom: '1px solid var(--border-default)',
                backgroundColor: 'var(--bg-muted)',
              }}
            >
              <Clock size={16} style={{ color: 'var(--text-muted)' }} />
              <h2 
                className="text-sm font-semibold"
                style={{ color: 'var(--text-primary)' }}
              >
                Recent Projects
              </h2>
              {isValidating && (
                <Loader2 
                  size={14} 
                  className="ml-auto animate-spin" 
                  style={{ color: 'var(--text-muted)' }}
                />
              )}
            </div>
            
            <div className="divide-y" style={{ borderColor: 'var(--border-subtle)' }}>
              {recentProjects.map((project) => (
                <ProjectItem
                  key={project.id}
                  project={project}
                  onOpen={() => onOpenProject(project)}
                  onRemove={() => onRemoveProject(project.id)}
                  formatDate={formatDate}
                />
              ))}
            </div>
          </div>
        )}

        {/* Empty State for Recent Projects */}
        {recentProjects.length === 0 && (
          <div 
            className="rounded-2xl p-8 text-center"
            style={{ 
              backgroundColor: 'var(--bg-surface)',
              border: '1px solid var(--border-default)',
            }}
          >
            <FolderPlus 
              size={48} 
              className="mx-auto mb-4" 
              style={{ color: 'var(--text-subtle)' }}
            />
            <p 
              className="text-sm font-medium mb-1"
              style={{ color: 'var(--text-muted)' }}
            >
              No recent projects
            </p>
            <p 
              className="text-xs"
              style={{ color: 'var(--text-subtle)' }}
            >
              Open a folder to get started with PIG
            </p>
          </div>
        )}
      </div>

      {/* Onboarding Modal */}
      {showOnboarding && (
        <OnboardingModal
          selectedPath={selectedPath}
          onConfirm={handleOnboardingConfirm}
          onCancel={handleOnboardingCancel}
        />
      )}
    </div>
  );
}

interface ProjectItemProps {
  project: RecentProject;
  onOpen: () => void;
  onRemove: () => void;
  formatDate: (date: string) => string;
}

function ProjectItem({ project, onOpen, onRemove, formatDate }: ProjectItemProps) {
  const [isHovered, setIsHovered] = useState(false);
  const isInvalid = project.isValid === false;

  return (
    <div
      className="group relative px-5 py-4 flex items-center gap-4 transition-colors cursor-pointer"
      style={{ 
        backgroundColor: isHovered ? 'var(--bg-muted)' : 'transparent',
        opacity: isInvalid ? 0.6 : 1,
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={() => !isInvalid && onOpen()}
    >
      {/* Status Icon */}
      <div 
        className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
        style={{ 
          backgroundColor: isInvalid 
            ? 'var(--error-50)' 
            : 'var(--accent-50)',
        }}
      >
        {isInvalid ? (
          <AlertCircle size={20} style={{ color: 'var(--error-500)' }} />
        ) : (
          <CheckCircle2 size={20} style={{ color: 'var(--accent-500)' }} />
        )}
      </div>

      {/* Project Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span 
            className="font-medium truncate"
            style={{ color: 'var(--text-primary)' }}
          >
            {project.name}
          </span>
          {project.isGitRepo && (
            <span title="Git repository">
              <GitBranch 
                size={14} 
                style={{ color: 'var(--text-subtle)' }}
              />
            </span>
          )}
        </div>
        <p 
          className="text-xs truncate"
          style={{ color: 'var(--text-muted)' }}
        >
          {project.path}
        </p>
        {isInvalid && (
          <p 
            className="text-xs mt-0.5"
            style={{ color: 'var(--error-500)' }}
          >
            Path no longer exists or is not a valid PIG repository
          </p>
        )}
      </div>

      {/* Date */}
      <span 
        className="text-xs flex-shrink-0"
        style={{ color: 'var(--text-subtle)' }}
      >
        {formatDate(project.lastOpened)}
      </span>

      {/* Actions */}
      <div 
        className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity"
        onClick={e => e.stopPropagation()}
      >
        {!isInvalid && (
          <button
            onClick={onOpen}
            className="p-2 rounded-lg transition-colors hover:bg-black/5 dark:hover:bg-white/5"
            style={{ color: 'var(--accent-500)' }}
            title="Open project"
          >
            <ArrowRight size={18} />
          </button>
        )}
        <button
          onClick={onRemove}
          className="p-2 rounded-lg transition-colors hover:bg-black/5 dark:hover:bg-white/5"
          style={{ color: 'var(--error-500)' }}
          title="Remove from list"
        >
          <Trash2 size={18} />
        </button>
      </div>
    </div>
  );
}

export default ProjectPicker;

