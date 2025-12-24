// Re-export types
export type {
  InvoiceToGenerate,
  GeneratedInvoice,
  ExtraFile,
  InvoiceStatus,
  ModalPhase,
  EmailTask,
  AttachmentItem,
  GenerateAllModalProps,
  GenerateAllOptions,
  GenerateAllResult,
  GenerateAllModalContextType,
} from './types';

// Re-export components
export { default as GenerateAllModal } from './GenerateAllModal';
export { default as GeneratingPhase } from './GeneratingPhase';
export { default as CompletePhase } from './CompletePhase';
export { default as EmailListPhase } from './EmailListPhase';
export { default as EmailComposePhase } from './EmailComposePhase';
export { default as ColorSwatchPicker } from './ColorSwatchPicker';

// Re-export hooks
export { useGenerationProcess } from './useGenerationProcess';
export { useEmailTasks } from './useEmailTasks';
export { useEmailComposer } from './useEmailComposer';
export { GenerateAllModalComponent } from './useGenerateAllModal';

// Re-export utilities
export { formatFileSize, getContentType, getFilenameFromPath, getFolderPath } from './utils';

// Re-export constants
export { TEXT_COLORS, HIGHLIGHT_COLORS } from './constants';
