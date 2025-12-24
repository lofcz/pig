import { useState, useEffect, useCallback, useRef } from 'react';
import { useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { TextStyle } from '@tiptap/extension-text-style';
import { Color } from '@tiptap/extension-color';
import Highlight from '@tiptap/extension-highlight';
import { open } from '@tauri-apps/plugin-dialog';
import { stat } from '@tauri-apps/plugin-fs';
import { openPath } from '@tauri-apps/plugin-opener';
import { tempDir } from '@tauri-apps/api/path';
import { toast } from 'sonner';

import { Currency, Config } from '../../types';
import { 
  evaluateSubject, 
  evaluateEmailBody, 
  PlaceholderContext 
} from '../../utils/emailTemplates';
import { sendEmail, fileToBase64Attachment, EmailAttachment, createZip } from '../../utils/email';
import { modal } from '../../contexts/ModalContext';
import { ConfirmModal } from '../modals/ConfirmModal';

import { EmailTask, AttachmentItem, ExtraFile, ModalPhase } from './types';
import { getContentType, getFilenameFromPath } from './utils';

interface UseEmailComposerProps {
  phase: ModalPhase;
  currentTask: EmailTask | undefined;
  currentTaskIndex: number;
  config?: Config;
  primaryCurrency: Currency;
  extraFiles: ExtraFile[];
  onTaskSent: () => void;
  onTaskError: () => void;
}

interface UseEmailComposerReturn {
  subject: string;
  setSubject: (subject: string) => void;
  editor: ReturnType<typeof useEditor>;
  attachments: AttachmentItem[];
  sendingEmail: boolean;
  activeColorPicker: 'text' | 'highlight' | null;
  setActiveColorPicker: (picker: 'text' | 'highlight' | null) => void;
  handleSendEmail: () => Promise<void>;
  handleAddAttachment: () => Promise<void>;
  handleRemoveAttachment: (id: string) => Promise<void>;
  handleRemoveAllBundledExtras: () => Promise<void>;
  handleOpenFile: (path: string) => Promise<void>;
  handleOpenExtrasZip: () => Promise<void>;
  resetComposer: () => void;
}

export function useEmailComposer({
  phase,
  currentTask,
  currentTaskIndex,
  config,
  primaryCurrency,
  extraFiles,
  onTaskSent,
  onTaskError,
}: UseEmailComposerProps): UseEmailComposerReturn {
  const [subject, setSubject] = useState('');
  const [attachments, setAttachments] = useState<AttachmentItem[]>([]);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [activeColorPicker, setActiveColorPicker] = useState<'text' | 'highlight' | null>(null);
  const attachmentsContainerRef = useRef<HTMLDivElement>(null);

  const editor = useEditor({
    extensions: [
      StarterKit,
      TextStyle,
      Color,
      Highlight.configure({ multicolor: true }),
    ],
    content: '',
    editable: true,
  });

  // Get supplier
  const supplier = config?.companies.find(c => c.isSupplier);

  // Initialize composer when entering email-compose phase
  useEffect(() => {
    if (phase !== 'email-compose' || !config || !supplier || !currentTask) return;

    // Build placeholder context
    const invoiceInfos = currentTask.invoices.map(inv => ({
      number: inv.invoiceNo || '',
      date: inv.issueDate || '',
      dueDate: inv.dueDate || '',
      amount: inv.amount,
      currency: primaryCurrency,
      description: inv.description || '',
    }));

    const context: PlaceholderContext = {
      contact: currentTask.contact,
      customer: currentTask.customers[0], // Use first customer for single-value placeholders
      supplier,
      invoice: invoiceInfos[0],
      invoices: invoiceInfos,
    };

    // Evaluate template
    const evaluatedSubject = evaluateSubject(currentTask.template.subject, context);
    const evaluatedBody = evaluateEmailBody(currentTask.template.body, context);
    
    setSubject(evaluatedSubject);
    editor?.commands.setContent(evaluatedBody);

    // Initialize attachments from task invoices and extra files
    const initAttachments = async () => {
      const items: AttachmentItem[] = [];
      
      // Add invoice PDFs
      for (const inv of currentTask.invoices) {
        if (!inv.pdfPath) continue;
        try {
          const fileStats = await stat(inv.pdfPath);
          const filename = getFilenameFromPath(inv.pdfPath) || `invoice_${inv.invoiceNo}.pdf`;
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
          const contentType = getContentType(extra.name);
          
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
    setActiveColorPicker(null);
  }, [phase, currentTask, currentTaskIndex, config, supplier, primaryCurrency, editor, extraFiles]);

  const handleOpenFile = useCallback(async (path: string) => {
    try {
      await openPath(path);
    } catch (e) {
      console.error('Failed to open file:', e);
    }
  }, []);

  const handleOpenExtrasZip = useCallback(async () => {
    const autoExtras = attachments.filter(a => !a.isInvoice && a.id.startsWith('extra-'));
    if (autoExtras.length === 0) return;

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
  }, [attachments, handleOpenFile]);

  const handleSendEmail = useCallback(async () => {
    if (!editor || !currentTask) return;

    setSendingEmail(true);

    try {
      const emailAttachments: EmailAttachment[] = [];
      
      // Separate attachments by type
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
        currentTask.connector,
        currentTask.contact.email,
        currentTask.contact.name,
        subject,
        bodyHtml,
        undefined,
        emailAttachments
      );

      if (result.success) {
        toast.success('Email sent successfully!');
        onTaskSent();
      } else {
        toast.error(`Failed to send: ${result.message}`);
        onTaskError();
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(`Failed to send: ${msg}`);
      onTaskError();
    } finally {
      setSendingEmail(false);
    }
  }, [editor, currentTask, attachments, subject, onTaskSent, onTaskError]);

  const handleAddAttachment = useCallback(async () => {
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
      
      for (const filePath of paths) {
        try {
          const fileStats = await stat(filePath);
          const filename = getFilenameFromPath(filePath);
          const contentType = getContentType(filename);
          
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
      
      if (newAttachments.length > 0) {
        setAttachments(prev => [...prev, ...newAttachments]);
        
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
  }, []);

  const handleRemoveAttachment = useCallback(async (id: string) => {
    const attachment = attachments.find(a => a.id === id);
    if (!attachment) return;

    const confirmed = await modal.open(ConfirmModal, {
      title: 'Remove Attachment',
      message: `Are you sure you want to remove "${attachment.filename}" from this email?`,
      confirmText: 'Remove',
      cancelText: 'Cancel',
      variant: 'danger'
    });

    if (confirmed) {
      setAttachments(prev => prev.filter(a => a.id !== id));
    }
  }, [attachments]);

  const handleRemoveAllBundledExtras = useCallback(async () => {
    const autoExtras = attachments.filter(a => !a.isInvoice && a.id.startsWith('extra-'));
    if (autoExtras.length === 0) return;

    const confirmed = await modal.open(ConfirmModal, {
      title: 'Remove All Bundled Extras',
      message: `Are you sure you want to remove all ${autoExtras.length} bundled document${autoExtras.length !== 1 ? 's' : ''} from this email?`,
      confirmText: 'Remove All',
      cancelText: 'Cancel',
      variant: 'danger'
    });

    if (confirmed) {
      setAttachments(prev => prev.filter(a => a.isInvoice || a.id.startsWith('custom-')));
    }
  }, [attachments]);

  const resetComposer = useCallback(() => {
    setSubject('');
    setAttachments([]);
    setSendingEmail(false);
    setActiveColorPicker(null);
    editor?.commands.setContent('');
  }, [editor]);

  return {
    subject,
    setSubject,
    editor,
    attachments,
    sendingEmail,
    activeColorPicker,
    setActiveColorPicker,
    handleSendEmail,
    handleAddAttachment,
    handleRemoveAttachment,
    handleRemoveAllBundledExtras,
    handleOpenFile,
    handleOpenExtrasZip,
    resetComposer,
  };
}
