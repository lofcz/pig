import { useState, useEffect, useRef } from 'react';
import { InvoiceToGenerate, InvoiceStatus, GeneratedInvoice, ModalPhase } from './types';

interface UseGenerationProcessProps {
  phase: ModalPhase;
  sessionInvoices: InvoiceToGenerate[];
  onGenerateInvoice: (id: string) => Promise<string | undefined>;
  onPhaseComplete: () => void;
}

interface UseGenerationProcessReturn {
  statuses: InvoiceStatus[];
  fakeProgress: number;
  generatedInvoices: GeneratedInvoice[];
}

export function useGenerationProcess({
  phase,
  sessionInvoices,
  onGenerateInvoice,
  onPhaseComplete,
}: UseGenerationProcessProps): UseGenerationProcessReturn {
  // Initialize statuses directly from sessionInvoices on first render
  const [statuses, setStatuses] = useState<InvoiceStatus[]>(() =>
    sessionInvoices.map(inv => ({ id: inv.id, status: 'pending' }))
  );
  const [currentIndex, setCurrentIndex] = useState(0);
  const [fakeProgress, setFakeProgress] = useState(0);
  const [generatedInvoices, setGeneratedInvoices] = useState<GeneratedInvoice[]>([]);
  const isGeneratingRef = useRef(false);
  const markedGeneratingIndexRef = useRef(-1);

  // Main generation loop
  useEffect(() => {
    if (phase !== 'generating' || sessionInvoices.length === 0) return;
    if (currentIndex >= sessionInvoices.length) {
      setFakeProgress(100);
      setTimeout(() => onPhaseComplete(), 500);
      return;
    }
    // Prevent concurrent generation
    if (isGeneratingRef.current) return;

    const invoice = sessionInvoices[currentIndex];
    
    // Mark as generating immediately (only once per index)
    if (markedGeneratingIndexRef.current !== currentIndex) {
      markedGeneratingIndexRef.current = currentIndex;
      setStatuses(prev => prev.map(s => 
        s.id === invoice.id ? { ...s, status: 'generating' } : s
      ));
    }

    const generateCurrent = async () => {
      isGeneratingRef.current = true;

      try {
        const pdfPath = await onGenerateInvoice(invoice.id);
        
        setStatuses(prev => prev.map(s => 
          s.id === invoice.id ? { ...s, status: 'done', pdfPath, justFinished: true } : s
        ));

        setTimeout(() => {
          setStatuses(prev => prev.map(s => 
            s.id === invoice.id ? { ...s, justFinished: false } : s
          ));
        }, 1300);

        if (pdfPath) {
          setGeneratedInvoices(prev => [...prev, {
            id: invoice.id,
            label: invoice.label,
            amount: invoice.amount,
            pdfPath,
            customerId: invoice.customerId,
            invoiceNo: invoice.invoiceNo,
            issueDate: invoice.issueDate,
            dueDate: invoice.dueDate,
            description: invoice.description,
          }]);
        }

        isGeneratingRef.current = false;
        setCurrentIndex(prev => prev + 1);
      } catch (error) {
        console.error('Generation error:', error);
        setStatuses(prev => prev.map(s => 
          s.id === invoice.id ? { ...s, status: 'error' } : s
        ));
        isGeneratingRef.current = false;
        setCurrentIndex(prev => prev + 1);
      }
    };

    const timer = setTimeout(generateCurrent, 300);
    return () => clearTimeout(timer);
  }, [phase, currentIndex, sessionInvoices, onGenerateInvoice, onPhaseComplete]);

  // Fake progress animation
  useEffect(() => {
    if (phase !== 'generating' || sessionInvoices.length === 0) return;

    const completedCount = statuses.filter(s => s.status === 'done').length;
    const generatingCount = statuses.filter(s => s.status === 'generating').length;
    
    const baseProgress = (completedCount / sessionInvoices.length) * 100;
    const partialProgress = generatingCount > 0 ? (0.5 / sessionInvoices.length) * 100 : 0;
    const targetProgress = Math.min(95, baseProgress + partialProgress);

    const interval = setInterval(() => {
      setFakeProgress(prev => {
        if (prev >= targetProgress) return prev;
        const step = Math.max(0.3, (targetProgress - prev) * 0.08);
        return Math.min(targetProgress, prev + step);
      });
    }, 30);

    return () => clearInterval(interval);
  }, [phase, statuses, sessionInvoices.length]);

  return {
    statuses,
    fakeProgress,
    generatedInvoices,
  };
}
