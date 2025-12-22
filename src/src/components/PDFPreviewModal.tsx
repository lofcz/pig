import { useEffect, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/TextLayer.css';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import { X, ZoomIn, ZoomOut, Loader2, FileWarning, FileText } from 'lucide-react';
import { useEventListener } from '../hooks';

// Set up the worker for Vite
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

interface PDFPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  pdfUrl: string | null;
  isLoading: boolean;
  progressStep?: string;
}

export default function PDFPreviewModal({ 
  isOpen, 
  onClose, 
  pdfUrl, 
  isLoading,
  progressStep
}: PDFPreviewModalProps) {
  const [numPages, setNumPages] = useState<number | null>(null);
  const [scale, setScale] = useState(1.0);
  const [pdfReady, setPdfReady] = useState(false);
  const [fakeProgress, setFakeProgress] = useState(0);

  // Reset state when opening new file
  useEffect(() => {
    if (isOpen) {
      setScale(1.0);
      setNumPages(null);
      setPdfReady(false);
      setFakeProgress(0);
    }
  }, [isOpen, pdfUrl]);

  // Fake progress animation
  useEffect(() => {
    if (!isLoading) {
      // Jump to 100% when done
      if (fakeProgress > 0) setFakeProgress(100);
      return;
    }

    setFakeProgress(0);
    
    const interval = setInterval(() => {
      setFakeProgress(prev => {
        // Slow down as we approach 90% (never reach 100% until actually done)
        if (prev >= 90) return prev;
        if (prev >= 70) return prev + Math.random() * 2;
        if (prev >= 40) return prev + Math.random() * 5;
        return prev + Math.random() * 10;
      });
    }, 200);

    return () => clearInterval(interval);
  }, [isLoading]);

  // Disable body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = '';
      };
    }
  }, [isOpen]);

  const canZoom = pdfReady && !isLoading;

  // Zoom helpers
  const zoomIn = useCallback(() => {
    if (!canZoom) return;
    setScale(s => Math.min(2.0, s + 0.1));
  }, [canZoom]);
  
  const zoomOut = useCallback(() => {
    if (!canZoom) return;
    setScale(s => Math.max(0.5, s - 0.1));
  }, [canZoom]);

  // Handle keyboard shortcuts
  useEventListener({
    type: 'keydown',
    handler: useCallback((e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === '+' || e.key === '=') zoomIn();
      if (e.key === '-') zoomOut();
    }, [onClose, zoomIn, zoomOut]),
    enabled: isOpen
  });

  // Handle Ctrl+wheel zoom (same as +/- buttons)
  useEventListener({
    type: 'wheel',
    handler: useCallback((e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      if (e.deltaY > 0) zoomOut();
      else zoomIn();
    }, [zoomIn, zoomOut]),
    enabled: isOpen,
    options: { passive: false }
  });

  if (!isOpen) return null;

  function onDocumentLoadSuccess({ numPages }: { numPages: number }) {
    setNumPages(numPages);
    setPdfReady(true);
  }

  return createPortal(
    <div 
      className="modal-backdrop animate-fade-in"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div 
        className="modal-content w-full max-w-5xl h-[90vh] flex flex-col"
        style={{ backgroundColor: 'var(--bg-surface)' }}
      >
        {/* Header */}
        <div 
          className="flex justify-between items-center px-6 py-4 shrink-0"
          style={{ borderBottom: '1px solid var(--border-default)' }}
        >
          <div className="flex items-center gap-3">
            <div 
              className="w-10 h-10 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: 'var(--accent-100)' }}
            >
              <FileText size={20} style={{ color: 'var(--accent-600)' }} />
            </div>
            <div>
              <h3 
                className="text-lg font-bold"
                style={{ color: 'var(--text-primary)' }}
              >
                Invoice Preview
              </h3>
              {numPages && (
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                  {numPages} page{numPages > 1 ? 's' : ''}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Zoom Controls */}
            <div 
              className="flex items-center gap-1 p-1 rounded-lg mr-2"
              style={{ backgroundColor: 'var(--bg-muted)' }}
            >
              <button 
                onClick={zoomOut}
                className={`btn btn-ghost btn-icon btn-sm ${!canZoom ? 'opacity-50 cursor-not-allowed' : ''}`}
                disabled={!canZoom}
                title="Zoom Out (−)"
              >
                <ZoomOut size={18} />
              </button>
              
              <span 
                className="text-sm font-mono w-14 text-center font-medium"
                style={{ color: 'var(--text-secondary)' }}
              >
                {Math.round(scale * 100)}%
              </span>
              
              <button 
                onClick={zoomIn}
                className={`btn btn-ghost btn-icon btn-sm ${!canZoom ? 'opacity-50 cursor-not-allowed' : ''}`}
                disabled={!canZoom}
                title="Zoom In (+)"
              >
                <ZoomIn size={18} />
              </button>
            </div>

            {/* Close Button */}
            <button 
              onClick={onClose}
              className="btn btn-ghost btn-icon"
              title="Close (Esc)"
            >
              <X size={22} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div 
          className="flex-1 overflow-auto min-h-0"
          style={{ backgroundColor: 'var(--bg-muted)' }}
        >
          <div className="w-full h-full flex flex-col items-center p-6">
            {isLoading ? (
              <div className="flex-1 w-full flex flex-col items-center justify-center space-y-6">
                {/* Loading Icon */}
                <div 
                  className="w-20 h-20 rounded-2xl flex items-center justify-center"
                  style={{ backgroundColor: 'var(--accent-100)' }}
                >
                  <FileText size={40} style={{ color: 'var(--accent-500)' }} />
                </div>
                
                <div className="text-center">
                  <p 
                    className="text-lg font-semibold mb-1"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    Generating Preview
                  </p>
                  {progressStep && (
                    <p 
                      className="text-sm animate-pulse"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      {progressStep}
                    </p>
                  )}
                </div>

                {/* Progress Bar */}
                <div 
                  className="w-48 h-1.5 rounded-full overflow-hidden"
                  style={{ backgroundColor: 'var(--border-default)' }}
                >
                  <div 
                    className="h-full rounded-full"
                    style={{ 
                      width: `${Math.min(fakeProgress, 100)}%`,
                      background: 'linear-gradient(90deg, var(--accent-400), var(--accent-600))',
                      transition: 'width 0.2s ease-out'
                    }}
                  />
                </div>
              </div>
            ) : pdfUrl ? (
              <Document
                file={pdfUrl}
                onLoadSuccess={onDocumentLoadSuccess}
                loading={
                  <div className="flex-1 w-full flex flex-col items-center justify-center">
                    <Loader2 
                      size={32} 
                      className="animate-spin mb-3" 
                      style={{ color: 'var(--accent-500)' }} 
                    />
                    <span style={{ color: 'var(--text-muted)' }}>Loading PDF...</span>
                  </div>
                }
                error={
                  <div className="flex-1 w-full flex flex-col items-center justify-center">
                    <div 
                      className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
                      style={{ backgroundColor: 'var(--error-100)' }}
                    >
                      <FileWarning size={32} style={{ color: 'var(--error-500)' }} />
                    </div>
                    <p 
                      className="font-semibold"
                      style={{ color: 'var(--error-600)' }}
                    >
                      Failed to load PDF
                    </p>
                    <p 
                      className="text-sm mt-1"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      Make sure the file exists and is valid.
                    </p>
                  </div>
                }
              >
                {numPages && Array.from(new Array(numPages), (_, index) => (
                  <div 
                    key={`page_${index + 1}`} 
                    className="mb-6 rounded-lg overflow-hidden animate-fade-in"
                    style={{ 
                      boxShadow: 'var(--shadow-xl)',
                      animationDelay: `${index * 100}ms`
                    }}
                  >
                    <Page 
                      pageNumber={index + 1} 
                      scale={scale} 
                      renderTextLayer={true}
                      renderAnnotationLayer={true}
                      className="bg-white"
                    />
                  </div>
                ))}
              </Document>
            ) : (
              <div className="flex-1 w-full flex flex-col items-center justify-center">
                <div 
                  className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
                  style={{ backgroundColor: 'var(--bg-subtle)' }}
                >
                  <FileText size={32} style={{ color: 'var(--text-muted)' }} />
                </div>
                <p style={{ color: 'var(--text-muted)' }}>No PDF available</p>
              </div>
            )}
          </div>
        </div>

        {/* Footer with keyboard shortcuts hint */}
        <div 
          className="px-6 py-3 flex items-center justify-center gap-6 shrink-0"
          style={{ 
            borderTop: '1px solid var(--border-default)',
            backgroundColor: 'var(--bg-muted)'
          }}
        >
          <span className="text-xs" style={{ color: 'var(--text-subtle)' }}>
            <kbd 
              className="px-1.5 py-0.5 rounded text-xs font-mono"
              style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-default)' }}
            >
              Esc
            </kbd>
            {' '}to close
          </span>
          <span className="text-xs" style={{ color: 'var(--text-subtle)' }}>
            <kbd 
              className="px-1.5 py-0.5 rounded text-xs font-mono"
              style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-default)' }}
            >
              +
            </kbd>
            {' '}/
            <kbd 
              className="px-1.5 py-0.5 rounded text-xs font-mono"
              style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-default)' }}
            >
              −
            </kbd>
            {' '}to zoom
          </span>
        </div>
      </div>
    </div>,
    document.body
  );
}
