import { useEffect, useState } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/TextLayer.css';
import 'react-pdf/dist/Page/AnnotationLayer.css';

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

  // Reset state when opening new file
  useEffect(() => {
    if (isOpen) {
        setScale(1.0);
        setNumPages(null);
        setPdfReady(false);
    }
  }, [isOpen, pdfUrl]);

  if (!isOpen) return null;

  function onDocumentLoadSuccess({ numPages }: { numPages: number }) {
    setNumPages(numPages);
    setPdfReady(true);
  }

  const canZoom = pdfReady && !isLoading;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-5xl h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex justify-between items-center p-4 border-b shrink-0">
          <h3 className="text-xl font-bold text-gray-800">Invoice Preview</h3>
          <div className="flex items-center gap-4">
            <button 
                onClick={() => setScale(s => Math.max(0.5, s - 0.1))}
                className={`p-1 px-3 rounded transition-colors ${
                    canZoom 
                        ? 'bg-gray-200 hover:bg-gray-300 cursor-pointer' 
                        : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                }`}
                disabled={!canZoom}
            >−</button>
            <span className="text-sm w-14 text-center font-mono">{Math.round(scale * 100)}%</span>
            <button 
                onClick={() => setScale(s => Math.min(2.0, s + 0.1))}
                className={`p-1 px-3 rounded transition-colors ${
                    canZoom 
                        ? 'bg-gray-200 hover:bg-gray-300 cursor-pointer' 
                        : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                }`}
                disabled={!canZoom}
            >+</button>
            <button 
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700 ml-4"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto bg-gray-100 relative min-h-0">
            <div className="w-full h-full flex flex-col items-center p-4">
                {isLoading ? (
                    <div className="flex-1 w-full flex flex-col items-center justify-center space-y-4">
                        <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                        <div className="text-lg font-medium text-gray-700">Generating Preview...</div>
                        {progressStep && (
                            <div className="text-sm text-gray-500 animate-pulse">{progressStep}</div>
                        )}
                    </div>
                ) : pdfUrl ? (
                    <Document
                        file={pdfUrl}
                        onLoadSuccess={onDocumentLoadSuccess}
                        loading={
                            <div className="flex-1 w-full flex flex-col items-center justify-center">
                                <div className="w-10 h-10 border-4 border-blue-400 border-t-transparent rounded-full animate-spin"></div>
                                <span className="mt-2 text-gray-500">Loading PDF...</span>
                            </div>
                        }
                        error={
                            <div className="flex-1 w-full flex flex-col items-center justify-center text-red-500">
                                <p>Failed to load PDF.</p>
                                <p className="text-sm text-gray-400 mt-2">Make sure the file exists and is valid.</p>
                            </div>
                        }
                    >
                        {numPages && Array.from(new Array(numPages), (_, index) => (
                            <div key={`page_${index + 1}`} className="mb-4 shadow-lg">
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
                    <div className="flex-1 w-full flex items-center justify-center text-gray-500">
                        No PDF available
                    </div>
                )}
            </div>
        </div>
      </div>
    </div>
  );
}
