import { useState, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { openPath } from '@tauri-apps/plugin-opener';

import { useEventListener } from '../../hooks';
import { Config, Currency } from '../../types';

import { 
  ModalPhase, 
  InvoiceToGenerate, 
  ExtraFile,
  GenerateAllResult
} from './types';
import { getFolderPath } from './utils';
import { useGenerationProcess } from './useGenerationProcess';
import { useEmailTasks } from './useEmailTasks';
import { useEmailComposer } from './useEmailComposer';

import GeneratingPhase from './GeneratingPhase';
import CompletePhase from './CompletePhase';
import EmailListPhase from './EmailListPhase';
import EmailComposePhase from './EmailComposePhase';

interface GenerateAllModalInternalProps {
  onClose: (result: GenerateAllResult) => void;
  invoices: InvoiceToGenerate[];
  primaryCurrency: Currency;
  onGenerateInvoice: (id: string) => Promise<string | undefined>;
  rootPath: string;
  onComplete: () => Promise<void>;
  config?: Config;
  extraFiles?: ExtraFile[];
}

export default function GenerateAllModal({
  onClose,
  invoices,
  primaryCurrency,
  onGenerateInvoice,
  rootPath,
  onComplete,
  config,
  extraFiles = []
}: GenerateAllModalInternalProps) {
  const [phase, setPhase] = useState<ModalPhase>('generating');
  const [hasSynced, setHasSynced] = useState(false);
  // Initialize session invoices directly from props on mount
  const [sessionInvoices] = useState<InvoiceToGenerate[]>(() =>
    invoices.map(inv => ({
      id: inv.id,
      label: inv.label,
      amount: inv.amount,
      customerId: inv.customerId,
      invoiceNo: inv.invoiceNo,
      issueDate: inv.issueDate,
      dueDate: inv.dueDate,
      description: inv.description,
    }))
  );

  // Generation process hook
  const {
    statuses,
    fakeProgress,
    generatedInvoices,
  } = useGenerationProcess({
    phase,
    sessionInvoices,
    onGenerateInvoice,
    onPhaseComplete: () => setPhase('complete'),
  });

  // Email tasks hook
  const {
    emailTasks,
    currentTaskIndex,
    currentTask,
    sentCount,
    skippedCount,
    allEmailsDone,
    updateTaskStatus,
    resetEmailTasks,
    moveToNextTask,
  } = useEmailTasks({
    phase,
    config,
    generatedInvoices,
  });

  // Email composer hook
  const {
    subject,
    setSubject,
    editor,
    attachments,
    sendingEmail,
    activeColorPicker,
    setActiveColorPicker,
    handleSendEmail: sendEmail,
    handleAddAttachment,
    handleRemoveAttachment,
    handleRemoveAllBundledExtras,
    handleOpenFile,
    handleOpenExtrasZip,
  } = useEmailComposer({
    phase,
    currentTask,
    currentTaskIndex,
    config,
    primaryCurrency,
    extraFiles,
    onTaskSent: () => {
      updateTaskStatus(currentTaskIndex, 'sent');
      if (!moveToNextTask()) {
        setPhase('email-list');
      }
    },
    onTaskError: () => {
      updateTaskStatus(currentTaskIndex, 'error');
    },
  });

  // Disable body scroll when mounted
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  // Sync data when entering complete phase
  useEffect(() => {
    if (phase === 'complete' && !hasSynced) {
      setHasSynced(true);
      onComplete();
    }
  }, [phase, hasSynced, onComplete]);

  // Build result for onClose
  const buildResult = useCallback((): GenerateAllResult => ({
    generatedCount: generatedInvoices.length,
    totalAmount: generatedInvoices.reduce((sum, inv) => sum + inv.amount, 0),
    emailsSent: sentCount,
    emailsSkipped: skippedCount,
  }), [generatedInvoices, sentCount, skippedCount]);

  const handleClose = useCallback(() => {
    if (!hasSynced) {
      onComplete();
    }
    onClose(buildResult());
  }, [hasSynced, onComplete, onClose, buildResult]);

  // Keyboard handler
  useEventListener({
    type: 'keydown',
    handler: useCallback((e: KeyboardEvent) => {
      if (e.key === 'Escape' && (phase === 'complete' || phase === 'email-list')) {
        handleClose();
      }
    }, [phase, handleClose]),
    enabled: true
  });

  // Auto-close modal after all emails are sent/skipped
  useEffect(() => {
    if (phase === 'email-list' && allEmailsDone && sentCount > 0) {
      const timer = setTimeout(() => {
        handleClose();
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [phase, allEmailsDone, sentCount, handleClose]);

  const handleOpenFolder = useCallback(async () => {
    try {
      if (generatedInvoices.length > 0) {
        const folderPath = getFolderPath(generatedInvoices[0].pdfPath);
        await openPath(folderPath);
      } else {
        await openPath(rootPath);
      }
    } catch (e) {
      console.error('Failed to open folder:', e);
    }
  }, [generatedInvoices, rootPath]);

  // Check if email sending is available
  const canSendEmails = useMemo(() => {
    if (!config) return false;
    return generatedInvoices.some(inv => {
      if (!inv.customerId) return false;
      const customer = config.companies.find(c => c.id === inv.customerId);
      if (!customer) return false;
      return customer.contactId && customer.emailTemplateId && customer.emailConnectorId;
    });
  }, [config, generatedInvoices]);

  const handleStartEmailFlow = useCallback(() => {
    setPhase('email-list');
  }, []);

  const handleStartCompose = useCallback(() => {
    if (!currentTask) return;
    updateTaskStatus(currentTaskIndex, 'composing');
    setPhase('email-compose');
  }, [currentTask, currentTaskIndex, updateTaskStatus]);

  const handleBackToList = useCallback(() => {
    updateTaskStatus(currentTaskIndex, 'pending');
    setPhase('email-list');
  }, [currentTaskIndex, updateTaskStatus]);

  const handleSkipEmail = useCallback(() => {
    updateTaskStatus(currentTaskIndex, 'skipped');
    if (!moveToNextTask()) {
      setPhase('email-list');
    }
  }, [currentTaskIndex, updateTaskStatus, moveToNextTask]);

  const handleBackToComplete = useCallback(() => {
    resetEmailTasks();
    setPhase('complete');
  }, [resetEmailTasks]);

  return createPortal(
    <div className="generate-all-overlay">
      <div className="generate-all-backdrop" />
      
      <div className="generate-all-content">
        {/* GENERATING PHASE */}
        {phase === 'generating' && (
          <GeneratingPhase
            invoices={sessionInvoices}
            statuses={statuses}
            fakeProgress={fakeProgress}
            primaryCurrency={primaryCurrency}
          />
        )}

        {/* COMPLETE PHASE */}
        {phase === 'complete' && (
          <CompletePhase
            generatedInvoices={generatedInvoices}
            primaryCurrency={primaryCurrency}
            canSendEmails={canSendEmails}
            onOpenFile={handleOpenFile}
            onOpenFolder={handleOpenFolder}
            onStartEmailFlow={handleStartEmailFlow}
            onClose={handleClose}
          />
        )}

        {/* EMAIL LIST PHASE */}
        {phase === 'email-list' && (
          <EmailListPhase
            emailTasks={emailTasks}
            currentTaskIndex={currentTaskIndex}
            primaryCurrency={primaryCurrency}
            allEmailsDone={allEmailsDone}
            sentCount={sentCount}
            skippedCount={skippedCount}
            onStartCompose={handleStartCompose}
            onSkipEmail={handleSkipEmail}
            onBackToComplete={handleBackToComplete}
            onClose={handleClose}
          />
        )}

        {/* EMAIL COMPOSE PHASE */}
        {phase === 'email-compose' && currentTask && (
          <EmailComposePhase
            currentTask={currentTask}
            currentTaskIndex={currentTaskIndex}
            totalTasks={emailTasks.length}
            subject={subject}
            onSubjectChange={setSubject}
            editor={editor}
            attachments={attachments}
            sendingEmail={sendingEmail}
            activeColorPicker={activeColorPicker}
            onSetActiveColorPicker={setActiveColorPicker}
            onBackToList={handleBackToList}
            onSkipEmail={handleSkipEmail}
            onSendEmail={sendEmail}
            onAddAttachment={handleAddAttachment}
            onRemoveAttachment={handleRemoveAttachment}
            onRemoveAllBundledExtras={handleRemoveAllBundledExtras}
            onOpenFile={handleOpenFile}
            onOpenExtrasZip={handleOpenExtrasZip}
          />
        )}
      </div>
    </div>,
    document.body
  );
}
