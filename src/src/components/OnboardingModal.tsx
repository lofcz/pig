/**
 * OnboardingModal - Scaffolds a new PIG repository
 * 
 * Displayed when user selects a folder that is not a PIG repository.
 * Allows customization of folder structure before scaffolding.
 */

import { useState, useEffect } from 'react';
import {
  X,
  FolderPlus,
  FileText,
  Receipt,
  Clock,
  CheckCircle2,
  Sparkles,
  ArrowRight,
  Info,
  GitBranch,
} from 'lucide-react';
import { ProjectStructure, DEFAULT_PROJECT_STRUCTURE } from '../types/project';
import { checkIsGitRepo, detectExistingStructure } from '../utils/repository';

interface OnboardingModalProps {
  /** Path selected by the user */
  selectedPath: string;
  /** Called when user confirms and wants to scaffold */
  onConfirm: (projectName: string, structure: ProjectStructure) => Promise<void>;
  /** Called when user cancels */
  onCancel: () => void;
}

export function OnboardingModal({ selectedPath, onConfirm, onCancel }: OnboardingModalProps) {
  const [step, setStep] = useState<'info' | 'customize' | 'creating'>('info');
  const [projectName, setProjectName] = useState('');
  const [structure, setStructure] = useState<ProjectStructure>(DEFAULT_PROJECT_STRUCTURE);
  const [isGitRepo, setIsGitRepo] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Extract folder name for default project name
  useEffect(() => {
    const pathParts = selectedPath.replace(/\\/g, '/').split('/');
    const folderName = pathParts[pathParts.length - 1] || 'My Invoices';
    setProjectName(folderName);
    
    // Check if it's a git repo and detect existing structure
    const detect = async () => {
      const [gitRepo, existingStructure] = await Promise.all([
        checkIsGitRepo(selectedPath),
        detectExistingStructure(selectedPath),
      ]);
      setIsGitRepo(gitRepo);
      setStructure(existingStructure);
    };
    detect();
  }, [selectedPath]);

  const handleConfirm = async () => {
    if (!projectName.trim()) {
      setError('Project name is required');
      return;
    }
    
    setStep('creating');
    setError(null);
    setIsLoading(true);
    
    try {
      await onConfirm(projectName.trim(), structure);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create project');
      setStep('customize');
    } finally {
      setIsLoading(false);
    }
  };

  const updateStructure = <K extends keyof ProjectStructure>(key: K, value: ProjectStructure[K]) => {
    setStructure(prev => ({ ...prev, [key]: value }));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onCancel}
      />
      
      {/* Modal */}
      <div 
        className="relative w-full max-w-xl rounded-2xl shadow-2xl overflow-hidden"
        style={{ 
          backgroundColor: 'var(--bg-base)',
          border: '1px solid var(--border-default)',
        }}
      >
        {/* Header with gradient */}
        <div 
          className="relative px-6 py-8 overflow-hidden"
          style={{
            background: 'linear-gradient(135deg, var(--accent-500) 0%, var(--accent-600) 100%)',
          }}
        >
          {/* Decorative circles */}
          <div 
            className="absolute -top-10 -right-10 w-40 h-40 rounded-full opacity-20"
            style={{ backgroundColor: 'white' }}
          />
          <div 
            className="absolute -bottom-8 -left-8 w-32 h-32 rounded-full opacity-10"
            style={{ backgroundColor: 'white' }}
          />
          
          <button
            onClick={onCancel}
            className="absolute top-4 right-4 p-2 rounded-lg transition-colors hover:bg-white/20"
            style={{ color: 'white' }}
          >
            <X size={20} />
          </button>
          
          <div className="relative flex items-center gap-4">
            <div 
              className="w-14 h-14 rounded-xl flex items-center justify-center"
              style={{ backgroundColor: 'rgba(255,255,255,0.2)' }}
            >
              <Sparkles size={28} className="text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">
                Initialize PIG Repository
              </h2>
              <p className="text-white/80 text-sm mt-0.5">
                Set up your invoice management workspace
              </p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          {step === 'info' && (
            <div className="space-y-5">
              {/* Path info */}
              <div 
                className="p-4 rounded-xl"
                style={{ backgroundColor: 'var(--bg-muted)' }}
              >
                <div className="flex items-start gap-3">
                  <Info size={18} style={{ color: 'var(--accent-500)', marginTop: 2 }} />
                  <div>
                    <p 
                      className="text-sm font-medium"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      Selected folder is not a PIG repository
                    </p>
                    <p 
                      className="text-xs mt-1 font-mono break-all"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      {selectedPath}
                    </p>
                  </div>
                </div>
              </div>

              {/* Git repo indicator */}
              {isGitRepo && (
                <div 
                  className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm"
                  style={{ 
                    backgroundColor: 'var(--success-50)',
                    color: 'var(--success-600)',
                  }}
                >
                  <GitBranch size={16} />
                  <span className="font-medium">Git repository detected</span>
                </div>
              )}

              {/* What will be created */}
              <div>
                <h3 
                  className="text-sm font-semibold mb-3"
                  style={{ color: 'var(--text-primary)' }}
                >
                  This will create the following structure:
                </h3>
                <div className="space-y-2">
                  {[
                    { icon: FolderPlus, text: '.pig/', desc: 'Configuration folder' },
                    { icon: FileText, text: '.pig/cfg.json', desc: 'Main configuration' },
                    { icon: Receipt, text: `${structure.invoicesFolder}/`, desc: 'Year-based invoice folders' },
                    { icon: Clock, text: `${structure.reimbursePendingFolder}/`, desc: 'Expenses to process' },
                    { icon: CheckCircle2, text: `${structure.reimburseDoneFolder}/`, desc: 'Processed expenses' },
                  ].map(({ icon: Icon, text, desc }) => (
                    <div 
                      key={text}
                      className="flex items-center gap-3 px-3 py-2 rounded-lg"
                      style={{ backgroundColor: 'var(--bg-surface)' }}
                    >
                      <Icon size={16} style={{ color: 'var(--accent-500)' }} />
                      <span 
                        className="font-mono text-sm"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        {text}
                      </span>
                      <span 
                        className="text-xs ml-auto"
                        style={{ color: 'var(--text-muted)' }}
                      >
                        {desc}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-3 pt-2">
                <button
                  onClick={onCancel}
                  className="btn btn-secondary flex-1"
                >
                  Cancel
                </button>
                <button
                  onClick={() => setStep('customize')}
                  className="btn btn-primary flex-1 flex items-center justify-center gap-2"
                >
                  <span>Continue</span>
                  <ArrowRight size={16} />
                </button>
              </div>
            </div>
          )}

          {step === 'customize' && (
            <div className="space-y-5">
              {/* Project name */}
              <div>
                <label 
                  className="text-sm font-medium mb-2 block"
                  style={{ color: 'var(--text-primary)' }}
                >
                  Project Name
                </label>
                <input
                  type="text"
                  value={projectName}
                  onChange={e => {
                    setProjectName(e.target.value);
                    setError(null);
                  }}
                  placeholder="My Invoices"
                  className="w-full"
                  autoFocus
                />
              </div>

              {/* Folder customization */}
              <div>
                <label 
                  className="text-sm font-medium mb-3 block"
                  style={{ color: 'var(--text-primary)' }}
                >
                  Customize Folder Names
                </label>
                <p 
                  className="text-xs mb-3"
                  style={{ color: 'var(--text-muted)' }}
                >
                  You can use your preferred naming convention. These can be changed later.
                </p>
                
                <div className="space-y-3">
                  <div>
                    <label 
                      className="text-xs mb-1 block"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      Invoices folder
                    </label>
                    <input
                      type="text"
                      value={structure.invoicesFolder}
                      onChange={e => updateStructure('invoicesFolder', e.target.value)}
                      placeholder="invoices"
                    />
                  </div>
                  <div>
                    <label 
                      className="text-xs mb-1 block"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      Pending reimbursements folder
                    </label>
                    <input
                      type="text"
                      value={structure.reimbursePendingFolder}
                      onChange={e => updateStructure('reimbursePendingFolder', e.target.value)}
                      placeholder="reimburse/pending"
                    />
                  </div>
                  <div>
                    <label 
                      className="text-xs mb-1 block"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      Completed reimbursements folder
                    </label>
                    <input
                      type="text"
                      value={structure.reimburseDoneFolder}
                      onChange={e => updateStructure('reimburseDoneFolder', e.target.value)}
                      placeholder="reimburse/done"
                    />
                  </div>
                </div>
              </div>

              {/* Error message */}
              {error && (
                <div 
                  className="px-4 py-3 rounded-lg text-sm"
                  style={{ 
                    backgroundColor: 'var(--error-50)',
                    color: 'var(--error-600)',
                  }}
                >
                  {error}
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setStep('info')}
                  className="btn btn-secondary flex-1"
                >
                  Back
                </button>
                <button
                  onClick={handleConfirm}
                  disabled={isLoading}
                  className="btn btn-primary flex-1 flex items-center justify-center gap-2"
                >
                  <Sparkles size={16} />
                  <span>Create Repository</span>
                </button>
              </div>
            </div>
          )}

          {step === 'creating' && (
            <div className="py-8 flex flex-col items-center justify-center gap-4">
              <div 
                className="w-16 h-16 rounded-2xl flex items-center justify-center animate-pulse"
                style={{ 
                  background: 'linear-gradient(135deg, var(--accent-500), var(--accent-600))',
                }}
              >
                <FolderPlus size={32} className="text-white" />
              </div>
              <p 
                className="text-sm font-medium"
                style={{ color: 'var(--text-muted)' }}
              >
                Creating repository structure...
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default OnboardingModal;

