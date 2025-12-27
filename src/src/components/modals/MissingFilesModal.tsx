import { AlertCircle, FolderOpen, ArrowLeft } from 'lucide-react';
import { useProjectWatcher } from '../../contexts/ProjectWatcherContext';

interface MissingFilesModalProps {
  rootPath: string;
  onRelocate?: () => Promise<void> | void;
  onClose?: () => void;
}

export const MissingFilesModal: React.FC<MissingFilesModalProps> = ({ 
  rootPath, 
  onRelocate, 
  onClose 
}) => {
  const { isIntegrityLost } = useProjectWatcher();

  if (!isIntegrityLost) return null;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      style={{ animation: 'opacityFadeIn 0.2s ease-out forwards' }}
    >
      <div 
        className="w-full max-w-md p-6 rounded-2xl shadow-xl border"
        style={{ 
          backgroundColor: 'var(--bg-surface)',
          borderColor: 'var(--border-default)',
        }}
      >
        {/* Icon */}
        <div className="flex justify-center mb-6">
          <div 
            className="w-16 h-16 rounded-full flex items-center justify-center"
            style={{ backgroundColor: 'var(--error-100)' }}
          >
            <AlertCircle size={32} style={{ color: 'var(--error-500)' }} />
          </div>
        </div>

        {/* Title */}
        <h3 
          className="text-xl font-bold text-center mb-2"
          style={{ color: 'var(--text-primary)' }}
        >
          Project Files Missing
        </h3>

        {/* Message */}
        <div className="text-center mb-8">
          <p 
            className="mb-2"
            style={{ color: 'var(--text-muted)' }}
          >
            The configuration for this project cannot be found.
          </p>
          <p 
            className="text-sm px-3 py-2 rounded-lg font-mono break-all"
            style={{ 
              backgroundColor: 'var(--bg-muted)',
              color: 'var(--text-subtle)',
              fontSize: '0.75rem'
            }}
          >
            {rootPath}
          </p>
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-3">
          {onRelocate && (
            <button
              onClick={onRelocate}
              className="btn btn-primary w-full py-3 flex items-center justify-center gap-2"
            >
              <FolderOpen size={18} />
              <span>Relocate Project Folder</span>
            </button>
          )}
          
          {onClose && (
            <button
              onClick={onClose}
              className="btn btn-ghost w-full py-3 flex items-center justify-center gap-2"
              style={{ color: 'var(--text-muted)' }}
            >
              <ArrowLeft size={18} />
              <span>Close Project</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
