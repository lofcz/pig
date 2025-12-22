import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { openPath } from '@tauri-apps/plugin-opener';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { TextStyle } from '@tiptap/extension-text-style';
import { Color } from '@tiptap/extension-color';
import Highlight from '@tiptap/extension-highlight';
import { open } from '@tauri-apps/plugin-dialog';
import { stat } from '@tauri-apps/plugin-fs';
import { 
  Sparkles, 
  CheckCircle2, 
  Loader2, 
  FolderOpen, 
  FileText, 
  X,
  ExternalLink,
  PartyPopper,
  Mail,
  ChevronRight,
  ChevronLeft,
  Send,
  User,
  Building2,
  SkipForward,
  Paperclip,
  Plus,
  Trash2,
  AlertCircle,
  Bold,
  Italic,
  Strikethrough,
  List,
  ListOrdered,
  Undo,
  Redo,
  Palette,
  Highlighter,
  Check,
  Archive
} from 'lucide-react';

// Color swatch presets
const TEXT_COLORS = [
  { name: 'Default', value: '' },
  { name: 'Black', value: '#000000' },
  { name: 'Dark Gray', value: '#4a4a4a' },
  { name: 'Gray', value: '#9ca3af' },
  { name: 'Red', value: '#ef4444' },
  { name: 'Orange', value: '#f97316' },
  { name: 'Yellow', value: '#eab308' },
  { name: 'Green', value: '#22c55e' },
  { name: 'Teal', value: '#14b8a6' },
  { name: 'Blue', value: '#3b82f6' },
  { name: 'Indigo', value: '#6366f1' },
  { name: 'Purple', value: '#a855f7' },
  { name: 'Pink', value: '#ec4899' },
];

const HIGHLIGHT_COLORS = [
  { name: 'None', value: '' },
  { name: 'Yellow', value: '#fef08a' },
  { name: 'Lime', value: '#bef264' },
  { name: 'Green', value: '#86efac' },
  { name: 'Cyan', value: '#67e8f9' },
  { name: 'Blue', value: '#93c5fd' },
  { name: 'Purple', value: '#d8b4fe' },
  { name: 'Pink', value: '#f9a8d4' },
  { name: 'Red', value: '#fca5a5' },
  { name: 'Orange', value: '#fdba74' },
];

interface ColorSwatchPickerProps {
  colors: { name: string; value: string }[];
  currentColor: string;
  onSelect: (color: string) => void;
  onClose: () => void;
  type: 'text' | 'highlight';
}

function ColorSwatchPicker({ colors, currentColor, onSelect, onClose, type }: ColorSwatchPickerProps) {
  const [customColor, setCustomColor] = useState(currentColor || (type === 'highlight' ? '#fef08a' : '#000000'));
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  return (
    <div ref={pickerRef} className="color-swatch-picker">
      <div className="color-swatch-grid">
        {colors.map((color) => (
          <button
            key={color.name}
            type="button"
            className={`color-swatch ${currentColor === color.value ? 'active' : ''} ${!color.value ? 'none' : ''}`}
            style={color.value ? { backgroundColor: color.value } : undefined}
            onClick={() => {
              onSelect(color.value);
              onClose();
            }}
            title={color.name}
          >
            {currentColor === color.value && color.value && <Check size={12} />}
            {!color.value && <X size={12} />}
          </button>
        ))}
      </div>
      <div className="color-swatch-custom">
        <span className="color-swatch-custom-label">Custom:</span>
        <input
          type="color"
          value={customColor}
          onChange={(e) => setCustomColor(e.target.value)}
          className="color-swatch-custom-input"
        />
        <button
          type="button"
          className="color-swatch-custom-apply"
          onClick={() => {
            onSelect(customColor);
            onClose();
          }}
        >
          Apply
        </button>
      </div>
    </div>
  );
}
import { useEventListener } from '../hooks';
import { 
  Currency, 
  Config, 
  CompanyDetails, 
  Contact, 
  EmailTemplate, 
  EmailConnector 
} from '../types';
import { 
  evaluateSubject, 
  evaluateEmailBody, 
  PlaceholderContext 
} from '../utils/emailTemplates';
import { sendEmail, fileToBase64Attachment, EmailAttachment, createZip } from '../utils/email';
import { tempDir } from '@tauri-apps/api/path';
import { toast } from 'sonner';
import { useConfirm } from '../contexts/ConfirmModalContext';

interface GeneratedInvoice {
  id: string;
  label: string;
  amount: number;
  pdfPath: string;
  customerId?: string;
  invoiceNo?: string;
  issueDate?: string;
  dueDate?: string;
  description?: string;
}

interface InvoiceToGenerate {
  id: string;
  label: string;
  amount: number;
  customerId?: string;
  invoiceNo?: string;
  issueDate?: string;
  dueDate?: string;
  description?: string;
}

interface ExtraFile {
  path: string;
  name: string;
}

interface GenerateAllModalProps {
  isOpen: boolean;
  onClose: () => void;
  invoices: InvoiceToGenerate[];
  primaryCurrency: Currency;
  onGenerateInvoice: (id: string) => Promise<string | undefined>;
  rootPath: string;
  onComplete: () => Promise<void>;
  config?: Config;
  extraFiles?: ExtraFile[]; // Extra files (receipts) to bundle and attach
}

type ModalPhase = 'generating' | 'complete' | 'email-list' | 'email-compose';

interface InvoiceStatus {
  id: string;
  status: 'pending' | 'generating' | 'done' | 'error';
  pdfPath?: string;
  justFinished?: boolean;
}

// Email task groups invoices by contact+template+connector
interface EmailTask {
  id: string;
  contact: Contact;
  template: EmailTemplate;
  connector: EmailConnector;
  customers: CompanyDetails[];
  invoices: GeneratedInvoice[];
  status: 'pending' | 'composing' | 'sent' | 'skipped' | 'error';
}

interface AttachmentItem {
  id: string;
  filename: string;
  path: string;
  size: number;
  contentType: string;
  isInvoice: boolean; // true for auto-added invoice PDFs, false for user-added extras
}

export default function GenerateAllModal({
  isOpen,
  onClose,
  invoices,
  primaryCurrency,
  onGenerateInvoice,
  rootPath,
  onComplete,
  config,
  extraFiles = []
}: GenerateAllModalProps) {
  const [phase, setPhase] = useState<ModalPhase>('generating');
  const [statuses, setStatuses] = useState<InvoiceStatus[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [fakeProgress, setFakeProgress] = useState(0);
  const [generatedInvoices, setGeneratedInvoices] = useState<GeneratedInvoice[]>([]);
  const [hasSynced, setHasSynced] = useState(false);
  const [sessionInvoices, setSessionInvoices] = useState<InvoiceToGenerate[]>([]);

  // Email flow state
  const [emailTasks, setEmailTasks] = useState<EmailTask[]>([]);
  const [currentTaskIndex, setCurrentTaskIndex] = useState(0);
  
  // Email composer state
  const [subject, setSubject] = useState('');
  const [attachments, setAttachments] = useState<AttachmentItem[]>([]);
  const [sendingEmail, setSendingEmail] = useState(false);
  const attachmentsContainerRef = useRef<HTMLDivElement>(null);
  const [activeColorPicker, setActiveColorPicker] = useState<'text' | 'highlight' | null>(null);

  const confirm = useConfirm();

  const editor = useEditor({
    extensions: [
      StarterKit,
      TextStyle,
      Color,
      Highlight.configure({ multicolor: true }),
    ],
    content: '',
    editable: true, // Always editable
  });

  // Get supplier
  const supplier = useMemo(() => 
    config?.companies.find(c => c.isSupplier), 
    [config?.companies]
  );

  useEffect(() => {
    if (!isOpen) {
      setSessionInvoices([]);
      setHasSynced(false);
      setPhase('generating');
      setCurrentIndex(0);
      setFakeProgress(0);
      setGeneratedInvoices([]);
      setStatuses([]);
      setEmailTasks([]);
      setCurrentTaskIndex(0);
      setSubject('');
      setAttachments([]);
      setSendingEmail(false);
      setActiveColorPicker(null);
      return;
    }

    const copiedInvoices = invoices.map(inv => ({
      id: inv.id,
      label: inv.label,
      amount: inv.amount,
      customerId: inv.customerId,
      invoiceNo: inv.invoiceNo,
      issueDate: inv.issueDate,
      dueDate: inv.dueDate,
      description: inv.description,
    }));
    setSessionInvoices(copiedInvoices);
    setPhase('generating');
    setCurrentIndex(0);
    setFakeProgress(0);
    setGeneratedInvoices([]);
    setHasSynced(false);
    setStatuses(copiedInvoices.map(inv => ({ id: inv.id, status: 'pending' })));
  }, [isOpen]);

  // Main generation loop
  useEffect(() => {
    if (!isOpen || phase !== 'generating' || sessionInvoices.length === 0) return;
    if (currentIndex >= sessionInvoices.length) {
      setFakeProgress(100);
      setTimeout(() => setPhase('complete'), 500);
      return;
    }

    const generateCurrent = async () => {
      const invoice = sessionInvoices[currentIndex];
      
      setStatuses(prev => prev.map(s => 
        s.id === invoice.id ? { ...s, status: 'generating' } : s
      ));

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

        setCurrentIndex(prev => prev + 1);
      } catch (error) {
        console.error('Generation error:', error);
        setStatuses(prev => prev.map(s => 
          s.id === invoice.id ? { ...s, status: 'error' } : s
        ));
        setCurrentIndex(prev => prev + 1);
      }
    };

    const timer = setTimeout(generateCurrent, 300);
    return () => clearTimeout(timer);
  }, [isOpen, phase, currentIndex, sessionInvoices, onGenerateInvoice]);

  // Fake progress animation
  useEffect(() => {
    if (!isOpen || phase !== 'generating' || sessionInvoices.length === 0) return;

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
  }, [isOpen, phase, statuses, sessionInvoices.length]);

  // Sync data when entering complete phase
  useEffect(() => {
    if (phase === 'complete' && !hasSynced) {
      setHasSynced(true);
      onComplete();
    }
  }, [phase, hasSynced]);

  // Build email tasks when FIRST entering email-list phase (only if tasks don't exist yet)
  // Groups by contact+template+connector (not just customer)
  useEffect(() => {
    // Only build tasks if we're entering email-list AND tasks haven't been built yet
    if (phase !== 'email-list' || !config || emailTasks.length > 0) return;

    // Group invoices by (contactId, templateId, connectorId)
    const groupKey = (inv: GeneratedInvoice) => {
      const customer = config.companies.find(c => c.id === inv.customerId);
      if (!customer) return null;
      if (!customer.contactId || !customer.emailTemplateId || !customer.emailConnectorId) return null;
      return `${customer.contactId}|${customer.emailTemplateId}|${customer.emailConnectorId}`;
    };

    const groups = new Map<string, GeneratedInvoice[]>();
    
    for (const inv of generatedInvoices) {
      const key = groupKey(inv);
      if (!key) continue;
      const existing = groups.get(key) || [];
      existing.push(inv);
      groups.set(key, existing);
    }

    const tasks: EmailTask[] = [];
    
    for (const [key, invs] of groups) {
      const [contactId, templateId, connectorId] = key.split('|');
      
      const contact = config.contacts.find(c => c.id === contactId);
      const template = config.emailTemplates.find(t => t.id === templateId);
      const connector = config.emailConnectors.find(c => c.id === connectorId);
      
      if (!contact || !template || !connector) continue;

      // Get unique customers for this group
      const customerIds = [...new Set(invs.map(inv => inv.customerId).filter(Boolean))];
      const customers = customerIds
        .map(id => config.companies.find(c => c.id === id))
        .filter((c): c is CompanyDetails => !!c);

      tasks.push({
        id: `task-${key}`,
        contact,
        template,
        connector,
        customers,
        invoices: invs,
        status: 'pending',
      });
    }

    setEmailTasks(tasks);
    setCurrentTaskIndex(0);
  }, [phase, config, generatedInvoices, emailTasks.length]);

  // Initialize composer when entering email-compose phase
  useEffect(() => {
    if (phase !== 'email-compose' || !config || !supplier) return;
    
    const task = emailTasks[currentTaskIndex];
    if (!task) return;

    // Build placeholder context
    const invoiceInfos = task.invoices.map(inv => ({
      number: inv.invoiceNo || '',
      date: inv.issueDate || '',
      dueDate: inv.dueDate || '',
      amount: inv.amount,
      currency: primaryCurrency,
      description: inv.description || '',
    }));

    const context: PlaceholderContext = {
      contact: task.contact,
      customer: task.customers[0], // Use first customer for single-value placeholders
      supplier,
      invoice: invoiceInfos[0],
      invoices: invoiceInfos,
    };

    // Evaluate template
    const evaluatedSubject = evaluateSubject(task.template.subject, context);
    const evaluatedBody = evaluateEmailBody(task.template.body, context);
    
    setSubject(evaluatedSubject);
    editor?.commands.setContent(evaluatedBody);

    // Initialize attachments from task invoices and extra files
    const initAttachments = async () => {
      const items: AttachmentItem[] = [];
      
      // Add invoice PDFs
      for (const inv of task.invoices) {
        if (!inv.pdfPath) continue;
        try {
          const fileStats = await stat(inv.pdfPath);
          const filename = inv.pdfPath.split(/[\\/]/).pop() || `invoice_${inv.invoiceNo}.pdf`;
          items.push({
            id: `invoice-${inv.id}`,
            filename,
            path: inv.pdfPath,
            size: fileStats.size,
            contentType: 'application/pdf',
            isInvoice: true,
          });
        } catch (e) {
          console.error(`Failed to stat ${inv.pdfPath}:`, e);
        }
      }
      
      // Add extra files (receipts, etc.)
      for (const extra of extraFiles) {
        try {
          const fileStats = await stat(extra.path);
          const ext = extra.name.split('.').pop()?.toLowerCase() || '';
          let contentType = 'application/octet-stream';
          if (ext === 'pdf') contentType = 'application/pdf';
          else if (['png', 'jpg', 'jpeg', 'gif'].includes(ext)) contentType = `image/${ext === 'jpg' ? 'jpeg' : ext}`;
          
          items.push({
            id: `extra-${extra.name}-${Date.now()}`,
            filename: extra.name,
            path: extra.path,
            size: fileStats.size,
            contentType,
            isInvoice: false,
          });
        } catch (e) {
          console.error(`Failed to stat extra file ${extra.path}:`, e);
        }
      }
      
      setAttachments(items);
    };

    initAttachments();
    setSendingEmail(false);
  }, [phase, emailTasks, currentTaskIndex, config, supplier, primaryCurrency, editor, extraFiles]);

  // Disable body scroll
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = '';
      };
    }
  }, [isOpen]);

  // Keyboard handler
  useEventListener({
    type: 'keydown',
    handler: useCallback((e: KeyboardEvent) => {
      if (e.key === 'Escape' && (phase === 'complete' || phase === 'email-list')) {
        handleClose();
      }
    }, [phase]),
    enabled: isOpen
  });

  const handleClose = () => {
    if (!hasSynced) {
      onComplete();
    }
    onClose();
  };

  const handleOpenFile = async (path: string) => {
    try {
      await openPath(path);
    } catch (e) {
      console.error('Failed to open file:', e);
    }
  };

  const handleOpenFolder = async () => {
    try {
      if (generatedInvoices.length > 0) {
        const firstPath = generatedInvoices[0].pdfPath;
        const folderPath = firstPath.substring(0, firstPath.lastIndexOf('\\'));
        await openPath(folderPath);
      } else {
        await openPath(rootPath);
      }
    } catch (e) {
      console.error('Failed to open folder:', e);
    }
  };

  // Check if email sending is available
  const canSendEmails = config && generatedInvoices.some(inv => {
    if (!inv.customerId) return false;
    const customer = config.companies.find(c => c.id === inv.customerId);
    if (!customer) return false;
    return customer.contactId && customer.emailTemplateId && customer.emailConnectorId;
  });

  const handleStartEmailFlow = () => {
    setPhase('email-list');
  };

  const handleStartCompose = () => {
    const task = emailTasks[currentTaskIndex];
    if (!task) return;
    
    setEmailTasks(prev => prev.map((t, i) => 
      i === currentTaskIndex ? { ...t, status: 'composing' } : t
    ));
    setPhase('email-compose');
  };

  const handleBackToList = () => {
    setEmailTasks(prev => prev.map((t, i) => 
      i === currentTaskIndex ? { ...t, status: 'pending' } : t
    ));
    setPhase('email-list');
  };

  const handleSkipEmail = () => {
    setEmailTasks(prev => prev.map((t, i) => 
      i === currentTaskIndex ? { ...t, status: 'skipped' } : t
    ));
    
    if (currentTaskIndex < emailTasks.length - 1) {
      setCurrentTaskIndex(prev => prev + 1);
    } else {
      setPhase('email-list'); // Go back to list to show summary
    }
  };

  const handleSendEmail = async () => {
    if (!editor) return;
    
    const task = emailTasks[currentTaskIndex];
    if (!task) return;

    setSendingEmail(true);

    try {
      const emailAttachments: EmailAttachment[] = [];
      
      // Separate attachments by type:
      // - Invoice attachments (standalone)
      // - Auto-added extras (bundled into zip) - ID starts with 'extra-'
      // - Custom-added attachments (standalone) - ID starts with 'custom-'
      const invoiceAttachments = attachments.filter(a => a.isInvoice);
      const autoExtraAttachments = attachments.filter(a => !a.isInvoice && a.id.startsWith('extra-'));
      const customAttachments = attachments.filter(a => !a.isInvoice && a.id.startsWith('custom-'));
      
      // Add invoice attachments individually
      for (const attachment of invoiceAttachments) {
        const att = await fileToBase64Attachment(
          attachment.path,
          attachment.filename,
          attachment.contentType
        );
        emailAttachments.push(att);
      }
      
      // Bundle auto-added extras into a zip if there are any
      if (autoExtraAttachments.length > 0) {
        const tmpDir = await tempDir();
        // Ensure path separator
        const separator = tmpDir.endsWith('\\') || tmpDir.endsWith('/') ? '' : '\\';
        const zipPath = `${tmpDir}${separator}extras_${Date.now()}.zip`;
        
        const zipResult = await createZip(
          autoExtraAttachments.map(a => a.path),
          zipPath
        );
        
        if (zipResult.success) {
          const zipAtt = await fileToBase64Attachment(
            zipPath,
            'extras.zip',
            'application/zip'
          );
          emailAttachments.push(zipAtt);
        } else {
          throw new Error(`Failed to create extras zip: ${zipResult.message}`);
        }
      }
      
      // Add custom attachments individually (standalone)
      for (const attachment of customAttachments) {
        const att = await fileToBase64Attachment(
          attachment.path,
          attachment.filename,
          attachment.contentType
        );
        emailAttachments.push(att);
      }

      const bodyHtml = editor.getHTML();
      
      const result = await sendEmail(
        task.connector,
        task.contact.email,
        task.contact.name,
        subject,
        bodyHtml,
        undefined,
        emailAttachments
      );

      if (result.success) {
        toast.success('Email sent successfully!');
        
        setEmailTasks(prev => prev.map((t, i) => 
          i === currentTaskIndex ? { ...t, status: 'sent' } : t
        ));
        
        // Move to next task or back to list
        if (currentTaskIndex < emailTasks.length - 1) {
          setCurrentTaskIndex(prev => prev + 1);
          // Stay in compose mode for next email
        } else {
          setPhase('email-list');
        }
      } else {
        toast.error(`Failed to send: ${result.message}`);
        setEmailTasks(prev => prev.map((t, i) => 
          i === currentTaskIndex ? { ...t, status: 'error' } : t
        ));
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(`Failed to send: ${msg}`);
      setEmailTasks(prev => prev.map((t, i) => 
        i === currentTaskIndex ? { ...t, status: 'error' } : t
      ));
    } finally {
      setSendingEmail(false);
    }
  };

  const handleAddAttachment = async () => {
    try {
      const result = await open({
        multiple: true,
        filters: [
          { name: 'Documents', extensions: ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'txt', 'csv'] },
          { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif'] },
          { name: 'All Files', extensions: ['*'] },
        ],
      });

      if (!result) return;

      const paths = Array.isArray(result) ? result : [result];
      const newAttachments: AttachmentItem[] = [];
      
      // Collect all new attachments first
      for (const filePath of paths) {
        try {
          const fileStats = await stat(filePath);
          const filename = filePath.split(/[\\/]/).pop() || 'file';
          const ext = filename.split('.').pop()?.toLowerCase() || '';
          
          let contentType = 'application/octet-stream';
          if (ext === 'pdf') contentType = 'application/pdf';
          else if (['png', 'jpg', 'jpeg', 'gif'].includes(ext)) contentType = `image/${ext === 'jpg' ? 'jpeg' : ext}`;
          else if (ext === 'txt') contentType = 'text/plain';
          
          newAttachments.push({
            id: `custom-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            filename,
            path: filePath,
            size: fileStats.size,
            contentType,
            isInvoice: false,
          });
        } catch (e) {
          console.error(`Failed to add ${filePath}:`, e);
        }
      }
      
      // Add all new attachments in a single state update
      if (newAttachments.length > 0) {
        setAttachments(prev => [...prev, ...newAttachments]);
        
        // Scroll to newly added attachments
        setTimeout(() => {
          attachmentsContainerRef.current?.scrollTo({
            top: attachmentsContainerRef.current.scrollHeight,
            behavior: 'smooth'
          });
        }, 50);
      }
    } catch (e) {
      console.error('Failed to open file dialog:', e);
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // Compute email stats for auto-close effect
  const sentCount = emailTasks.filter(t => t.status === 'sent').length;
  const skippedCount = emailTasks.filter(t => t.status === 'skipped').length;
  const allEmailsDone = emailTasks.length > 0 && emailTasks.every(t => t.status === 'sent' || t.status === 'skipped');

  // Auto-close modal after all emails are sent/skipped
  useEffect(() => {
    if (!isOpen) return;
    if (phase === 'email-list' && allEmailsDone && sentCount > 0) {
      const timer = setTimeout(() => {
        handleClose();
      }, 1500); // Brief delay to show success state
      return () => clearTimeout(timer);
    }
  }, [isOpen, phase, allEmailsDone, sentCount]);

  if (!isOpen) return null;

  const completedCount = statuses.filter(s => s.status === 'done').length;
  const totalCount = sessionInvoices.length;
  const totalAmount = generatedInvoices.reduce((sum, inv) => sum + inv.amount, 0);
  
  const currentTask = emailTasks[currentTaskIndex];

  return createPortal(
    <div className="generate-all-overlay">
      <div className="generate-all-backdrop" />
      
      <div className="generate-all-content">
        {/* ============ GENERATING PHASE ============ */}
        {phase === 'generating' && (
          <div className="generate-all-generating">
            <div className="generate-all-header">
              <div className="generate-all-icon-wrapper generating">
                <Sparkles size={32} className="generate-all-icon" />
              </div>
              <h2 className="generate-all-title">Generating Invoices</h2>
              <p className="generate-all-subtitle">
                {completedCount} of {totalCount} completed
              </p>
            </div>

            <div className="generate-all-progress-container">
              <div className="generate-all-progress-track">
                <div 
                  className="generate-all-progress-bar"
                  style={{ width: `${fakeProgress}%` }}
                />
                <div 
                  className="generate-all-progress-glow"
                  style={{ left: `${fakeProgress}%` }}
                />
              </div>
              <span className="generate-all-progress-text">
                {Math.round(fakeProgress)}%
              </span>
            </div>

            <div className="generate-all-list">
              {sessionInvoices.map((invoice) => {
                const status = statuses.find(s => s.id === invoice.id);
                const isActive = status?.status === 'generating';
                const isDone = status?.status === 'done';
                const isError = status?.status === 'error';
                const justFinished = status?.justFinished ?? false;

                return (
                  <div 
                    key={invoice.id}
                    className={`generate-all-item ${isDone ? 'done' : ''} ${isActive ? 'active' : ''} ${isError ? 'error' : ''} ${justFinished ? 'finished' : ''}`}
                  >
                    <div className="generate-all-item-status">
                      {isDone ? (
                        <CheckCircle2 size={20} className="status-icon done" />
                      ) : isActive ? (
                        <Loader2 size={20} className="status-icon active animate-spin" />
                      ) : isError ? (
                        <X size={20} className="status-icon error" />
                      ) : (
                        <div className="status-dot" />
                      )}
                    </div>
                    <div className="generate-all-item-content">
                      <span className="generate-all-item-label">{invoice.label}</span>
                      <span className="generate-all-item-amount">
                        {invoice.amount.toLocaleString()} {primaryCurrency}
                      </span>
                    </div>
                    {isDone && (
                      <div className="generate-all-item-checkmark">
                        <div className="checkmark-circle" />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ============ COMPLETE PHASE ============ */}
        {phase === 'complete' && (
          <div className="generate-all-complete">
            <div className="generate-all-header success">
              <div className="generate-all-icon-wrapper success">
                <PartyPopper size={36} className="generate-all-icon" />
              </div>
              <h2 className="generate-all-title">All Done!</h2>
              <p className="generate-all-subtitle">
                {generatedInvoices.length} invoice{generatedInvoices.length !== 1 ? 's' : ''} generated successfully
              </p>
            </div>

            <div className="generate-all-summary">
              <div className="generate-all-summary-item">
                <span className="summary-label">Total Value</span>
                <span className="summary-value">{totalAmount.toLocaleString()} {primaryCurrency}</span>
              </div>
            </div>

            <div className="generate-all-files">
              <h3 className="generate-all-files-title">Generated Files</h3>
              <div className="generate-all-files-list">
                {generatedInvoices.map((inv, idx) => (
                  <button
                    key={inv.id}
                    onClick={() => handleOpenFile(inv.pdfPath)}
                    className="generate-all-file-item"
                    style={{ animationDelay: `${idx * 80}ms` }}
                  >
                    <FileText size={18} className="file-icon" />
                    <div className="file-info">
                      <span className="file-label">{inv.label}</span>
                      <span className="file-amount">{inv.amount.toLocaleString()} {primaryCurrency}</span>
                    </div>
                    <ExternalLink size={16} className="file-external" />
                  </button>
                ))}
              </div>
            </div>

            <div className="generate-all-actions-wrapper">
              {canSendEmails && (
                <button 
                  onClick={handleStartEmailFlow}
                  className="btn btn-primary generate-all-btn-full"
                >
                  <Mail size={18} />
                  <span>Continue to Send Emails</span>
                  <ChevronRight size={16} />
                </button>
              )}
              <div className="generate-all-actions">
                <button 
                  onClick={handleOpenFolder}
                  className="btn btn-secondary generate-all-btn"
                >
                  <FolderOpen size={18} />
                  <span>Open Folder</span>
                </button>
                <button 
                  onClick={handleClose}
                  className="btn btn-success generate-all-btn"
                >
                  <CheckCircle2 size={18} />
                  <span>Done</span>
                </button>
              </div>
            </div>

            <p className="generate-all-hint">
              Press <kbd>Esc</kbd> to close
            </p>
          </div>
        )}

        {/* ============ EMAIL LIST PHASE ============ */}
        {phase === 'email-list' && (
          <div className="generate-all-email-list">
            <div className="generate-all-header">
              <div className="generate-all-icon-wrapper">
                <Mail size={32} className="generate-all-icon" />
              </div>
              <h2 className="generate-all-title">
                {allEmailsDone ? 'Emails Complete' : 'Send Invoice Emails'}
              </h2>
              <p className="generate-all-subtitle">
                {emailTasks.length === 0 
                  ? 'No customers have complete email configuration'
                  : allEmailsDone 
                    ? `${sentCount} sent, ${skippedCount} skipped`
                    : `${emailTasks.length} email${emailTasks.length !== 1 ? 's' : ''} to send`
                }
              </p>
            </div>

            {emailTasks.length === 0 ? (
              <div className="generate-all-empty">
                <AlertCircle size={48} style={{ color: 'var(--text-muted)', marginBottom: '1rem' }} />
                <p style={{ color: 'var(--text-muted)' }}>
                  No customers have complete email setup (contact, template, and SMTP connector).
                </p>
              </div>
            ) : (
              <div className="email-task-list">
                {emailTasks.map((task, idx) => {
                  const isCurrent = idx === currentTaskIndex && !allEmailsDone;
                  const taskAmount = task.invoices.reduce((s, inv) => s + inv.amount, 0);

                  return (
                    <div 
                      key={task.id}
                      className={`email-task-item ${task.status} ${isCurrent ? 'current' : ''}`}
                    >
                      <div className="email-task-status">
                        {task.status === 'sent' ? (
                          <CheckCircle2 size={20} style={{ color: 'var(--success-500)' }} />
                        ) : task.status === 'skipped' ? (
                          <SkipForward size={20} style={{ color: 'var(--text-muted)' }} />
                        ) : task.status === 'error' ? (
                          <AlertCircle size={20} style={{ color: 'var(--error-500)' }} />
                        ) : (
                          <div className={`email-task-dot ${isCurrent ? 'current' : ''}`} />
                        )}
                      </div>
                      
                      <div className="email-task-content">
                        <div className="email-task-recipient">
                          <User size={14} />
                          <span className="email-task-contact">{task.contact.name}</span>
                          <span className="email-task-email">&lt;{task.contact.email}&gt;</span>
                        </div>
                        <div className="email-task-meta">
                          <span className="email-task-invoices">
                            <FileText size={12} />
                            {task.invoices.length} invoice{task.invoices.length !== 1 ? 's' : ''}
                          </span>
                          {task.customers.length > 1 && (
                            <span className="email-task-customers">
                              <Building2 size={12} />
                              {task.customers.length} customers
                            </span>
                          )}
                          <span className="email-task-amount">
                            {taskAmount.toLocaleString()} {primaryCurrency}
                          </span>
                        </div>
                      </div>

                      {task.status === 'sent' && (
                        <div className="email-task-sent-badge">
                          <CheckCircle2 size={14} />
                          <span>Sent</span>
                        </div>
                      )}
                      
                      {task.status === 'skipped' && (
                        <div className="email-task-skipped-badge">
                          <span>Skipped</span>
                        </div>
                      )}
                      
                      {task.status === 'error' && (
                        <div className="email-task-error-badge">
                          <AlertCircle size={14} />
                          <span>Failed</span>
                        </div>
                      )}
                      
                      {isCurrent && task.status === 'pending' && (
                        <div className="email-task-actions">
                          <button
                            onClick={handleSkipEmail}
                            className="btn btn-ghost btn-sm"
                            title="Skip"
                          >
                            <SkipForward size={16} />
                          </button>
                          <button
                            onClick={handleStartCompose}
                            className="btn btn-primary btn-sm"
                          >
                            <Send size={14} />
                            <span>Compose</span>
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            <div className="generate-all-actions">
              <button 
                onClick={() => {
                  setEmailTasks([]); // Reset tasks so they can be rebuilt if user re-enters
                  setCurrentTaskIndex(0);
                  setPhase('complete');
                }}
                className="btn btn-secondary generate-all-btn"
              >
                <ChevronLeft size={18} />
                <span>Back</span>
              </button>
              <button 
                onClick={handleClose}
                className="btn btn-success generate-all-btn"
              >
                <CheckCircle2 size={18} />
                <span>Done</span>
              </button>
            </div>

            <p className="generate-all-hint">
              Press <kbd>Esc</kbd> to close
            </p>
          </div>
        )}

        {/* ============ EMAIL COMPOSE PHASE ============ */}
        {phase === 'email-compose' && currentTask && (
          <div className="generate-all-composer">
            {/* Header */}
            <div className="composer-header">
              <button 
                onClick={handleBackToList}
                className="btn btn-ghost btn-icon"
                disabled={sendingEmail}
              >
                <ChevronLeft size={20} />
              </button>
              <div className="composer-header-info">
                <h3 className="composer-title">
                  Compose Email ({currentTaskIndex + 1}/{emailTasks.length})
                </h3>
                <p className="composer-subtitle">
                  To: {currentTask.contact.name} &lt;{currentTask.contact.email}&gt;
                </p>
              </div>
              <button
                onClick={handleSkipEmail}
                disabled={sendingEmail}
                className="btn btn-ghost btn-sm"
              >
                <SkipForward size={16} />
                <span>Skip</span>
              </button>
            </div>

            {/* Subject */}
            <div className="composer-section">
              <label className="composer-label">Subject</label>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Email subject..."
                className="w-full"
                disabled={sendingEmail}
              />
            </div>

            {/* Body with WYSIWYG Toolbar */}
            <div className="composer-section composer-body-section">
              <label className="composer-label">Message</label>
              
              {/* Toolbar */}
              <div className="composer-toolbar">
                <div className="composer-toolbar-group">
                  <button
                    type="button"
                    onClick={() => editor?.chain().focus().toggleBold().run()}
                    className={`composer-toolbar-btn ${editor?.isActive('bold') ? 'active' : ''}`}
                    title="Bold"
                  >
                    <Bold size={16} />
                  </button>
                  <button
                    type="button"
                    onClick={() => editor?.chain().focus().toggleItalic().run()}
                    className={`composer-toolbar-btn ${editor?.isActive('italic') ? 'active' : ''}`}
                    title="Italic"
                  >
                    <Italic size={16} />
                  </button>
                  <button
                    type="button"
                    onClick={() => editor?.chain().focus().toggleStrike().run()}
                    className={`composer-toolbar-btn ${editor?.isActive('strike') ? 'active' : ''}`}
                    title="Strikethrough"
                  >
                    <Strikethrough size={16} />
                  </button>
                </div>

                <div className="composer-toolbar-divider" />

                <div className="composer-toolbar-group">
                  <div className="composer-color-picker-wrapper">
                    <button
                      type="button"
                      onClick={() => setActiveColorPicker(activeColorPicker === 'text' ? null : 'text')}
                      className={`composer-toolbar-btn ${activeColorPicker === 'text' ? 'active' : ''}`}
                      title="Text Color"
                    >
                      <Palette size={16} />
                    </button>
                    {activeColorPicker === 'text' && (
                      <ColorSwatchPicker
                        colors={TEXT_COLORS}
                        currentColor={editor?.getAttributes('textStyle').color || ''}
                        onSelect={(color) => {
                          if (color) {
                            editor?.chain().focus().setColor(color).run();
                          } else {
                            editor?.chain().focus().unsetColor().run();
                          }
                        }}
                        onClose={() => setActiveColorPicker(null)}
                        type="text"
                      />
                    )}
                  </div>
                  <div className="composer-color-picker-wrapper">
                    <button
                      type="button"
                      onClick={() => setActiveColorPicker(activeColorPicker === 'highlight' ? null : 'highlight')}
                      className={`composer-toolbar-btn ${activeColorPicker === 'highlight' ? 'active' : ''}`}
                      title="Highlight Color"
                    >
                      <Highlighter size={16} />
                    </button>
                    {activeColorPicker === 'highlight' && (
                      <ColorSwatchPicker
                        colors={HIGHLIGHT_COLORS}
                        currentColor={editor?.getAttributes('highlight').color || ''}
                        onSelect={(color) => {
                          if (color) {
                            editor?.chain().focus().toggleHighlight({ color }).run();
                          } else {
                            editor?.chain().focus().unsetHighlight().run();
                          }
                        }}
                        onClose={() => setActiveColorPicker(null)}
                        type="highlight"
                      />
                    )}
                  </div>
                </div>

                <div className="composer-toolbar-divider" />

                <div className="composer-toolbar-group">
                  <button
                    type="button"
                    onClick={() => editor?.chain().focus().toggleBulletList().run()}
                    className={`composer-toolbar-btn ${editor?.isActive('bulletList') ? 'active' : ''}`}
                    title="Bullet List"
                  >
                    <List size={16} />
                  </button>
                  <button
                    type="button"
                    onClick={() => editor?.chain().focus().toggleOrderedList().run()}
                    className={`composer-toolbar-btn ${editor?.isActive('orderedList') ? 'active' : ''}`}
                    title="Numbered List"
                  >
                    <ListOrdered size={16} />
                  </button>
                </div>

                <div className="composer-toolbar-divider" />

                <div className="composer-toolbar-group">
                  <button
                    type="button"
                    onClick={() => editor?.chain().focus().undo().run()}
                    disabled={!editor?.can().undo()}
                    className="composer-toolbar-btn"
                    title="Undo"
                  >
                    <Undo size={16} />
                  </button>
                  <button
                    type="button"
                    onClick={() => editor?.chain().focus().redo().run()}
                    disabled={!editor?.can().redo()}
                    className="composer-toolbar-btn"
                    title="Redo"
                  >
                    <Redo size={16} />
                  </button>
                </div>
              </div>

              {/* Editor */}
              <div className="composer-editor">
                <EditorContent editor={editor} className="composer-editor-content" />
              </div>
            </div>

            {/* Attachments */}
            <div className="composer-section">
              <div className="composer-attachments-header">
                <label className="composer-label">
                  <Paperclip size={14} />
                  Attachments ({attachments.filter(a => a.isInvoice).length + (attachments.some(a => !a.isInvoice) ? 1 : 0)})
                </label>
                <button
                  onClick={handleAddAttachment}
                  disabled={sendingEmail}
                  className="composer-add-attachment"
                >
                  <Plus size={12} />
                  Add Extra
                </button>
              </div>
              
              {attachments.length === 0 ? (
                <div className="composer-no-attachments">
                  <Paperclip size={20} />
                  <span>No attachments - invoices will be attached automatically</span>
                </div>
              ) : (
                <div className="composer-attachments" ref={attachmentsContainerRef}>
                  {/* Invoice attachments (standalone) */}
                  {attachments.filter(a => a.isInvoice).map((att) => (
                    <div key={att.id} className="composer-attachment">
                      <FileText size={14} style={{ color: 'var(--accent-500)' }} />
                      <span className="composer-attachment-name">{att.filename}</span>
                      <span className="composer-attachment-size">{formatFileSize(att.size)}</span>
                      <button
                        onClick={() => handleOpenFile(att.path)}
                        className="composer-attachment-action"
                        title="Open"
                      >
                        <ExternalLink size={12} />
                      </button>
                      <button
                        onClick={async () => {
                          const confirmed = await confirm({
                            title: 'Remove Attachment',
                            message: `Are you sure you want to remove "${att.filename}" from this email?`,
                            confirmText: 'Remove',
                            cancelText: 'Cancel',
                            variant: 'danger'
                          });
                          if (confirmed) {
                            setAttachments(prev => prev.filter(a => a.id !== att.id));
                          }
                        }}
                        disabled={sendingEmail}
                        className="composer-attachment-action delete"
                        title="Remove"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ))}
                  
                  {/* Auto-added extras (bundled into extra.zip) - ID starts with 'extra-' */}
                  {(() => {
                    const autoExtras = attachments.filter(a => !a.isInvoice && a.id.startsWith('extra-'));
                    if (autoExtras.length === 0) return null;
                    const totalSize = autoExtras.reduce((sum, a) => sum + a.size, 0);
                    return (
                      <div className="composer-attachment">
                        <Archive size={14} style={{ color: 'var(--accent-500)' }} />
                        <span className="composer-attachment-name">
                          extra.zip ({autoExtras.length} document{autoExtras.length !== 1 ? 's' : ''})
                        </span>
                        <span className="composer-attachment-size">{formatFileSize(totalSize)}</span>
                        <button
                          onClick={async () => {
                            // Create temp zip and open it
                            try {
                              const tmpDir = await tempDir();
                              const separator = tmpDir.endsWith('\\') || tmpDir.endsWith('/') ? '' : '\\';
                              const zipPath = `${tmpDir}${separator}extra_preview.zip`;
                              const result = await createZip(autoExtras.map(e => e.path), zipPath);
                              if (result.success) {
                                await handleOpenFile(zipPath);
                              }
                            } catch (e) {
                              console.error('Failed to create preview zip:', e);
                            }
                          }}
                          className="composer-attachment-action"
                          title="Open"
                        >
                          <ExternalLink size={12} />
                        </button>
                        <button
                          onClick={async () => {
                            const confirmed = await confirm({
                              title: 'Remove All Bundled Extras',
                              message: `Are you sure you want to remove all ${autoExtras.length} bundled document${autoExtras.length !== 1 ? 's' : ''} from this email?`,
                              confirmText: 'Remove All',
                              cancelText: 'Cancel',
                              variant: 'danger'
                            });
                            if (confirmed) {
                              setAttachments(prev => prev.filter(a => a.isInvoice || a.id.startsWith('custom-')));
                            }
                          }}
                          disabled={sendingEmail}
                          className="composer-attachment-action delete"
                          title="Remove all bundled extras"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    );
                  })()}
                  
                  {/* Custom-added attachments (standalone) - ID starts with 'custom-' */}
                  {attachments.filter(a => !a.isInvoice && a.id.startsWith('custom-')).map((att) => (
                    <div key={att.id} className="composer-attachment">
                      <FileText size={14} style={{ color: 'var(--accent-500)' }} />
                      <span className="composer-attachment-name">{att.filename}</span>
                      <span className="composer-attachment-size">{formatFileSize(att.size)}</span>
                      <button
                        onClick={() => handleOpenFile(att.path)}
                        className="composer-attachment-action"
                        title="Open"
                      >
                        <ExternalLink size={12} />
                      </button>
                      <button
                        onClick={async () => {
                          const confirmed = await confirm({
                            title: 'Remove Attachment',
                            message: `Are you sure you want to remove "${att.filename}" from this email?`,
                            confirmText: 'Remove',
                            cancelText: 'Cancel',
                            variant: 'danger'
                          });
                          if (confirmed) {
                            setAttachments(prev => prev.filter(a => a.id !== att.id));
                          }
                        }}
                        disabled={sendingEmail}
                        className="composer-attachment-action delete"
                        title="Remove"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="composer-actions">
              <button
                onClick={handleBackToList}
                disabled={sendingEmail}
                className="btn btn-secondary"
              >
                Cancel
              </button>
              <button
                onClick={handleSendEmail}
                disabled={sendingEmail || !subject.trim()}
                className="btn btn-primary"
              >
                {sendingEmail ? (
                  <>
                    <Loader2 size={18} className="animate-spin" />
                    <span>Sending...</span>
                  </>
                ) : (
                  <>
                    <Send size={18} />
                    <span>Send Email</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
