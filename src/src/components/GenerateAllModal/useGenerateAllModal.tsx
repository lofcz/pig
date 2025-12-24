import { ModalComponent } from '../../contexts/ModalContext';
import GenerateAllModal from './GenerateAllModal';
import { GenerateAllOptions, GenerateAllResult } from './types';

/**
 * Generate all invoices modal with email sending workflow.
 * 
 * @example
 * import { modal } from '../contexts/ModalContext';
 * import { GenerateAllModalComponent } from './GenerateAllModal';
 * 
 * const result = await modal.open(GenerateAllModalComponent, {
 *   config, invoices, extraFiles, primaryCurrency, rootPath,
 *   onGenerateInvoice, onComplete
 * });
 */
export const GenerateAllModalComponent: ModalComponent<GenerateAllOptions, GenerateAllResult> = 
  ({ resolve, ...options }) => (
    <GenerateAllModal
      onClose={resolve}
      invoices={options.invoices}
      primaryCurrency={options.primaryCurrency}
      onGenerateInvoice={options.onGenerateInvoice}
      rootPath={options.rootPath}
      onComplete={options.onComplete}
      config={options.config}
      extraFiles={options.extraFiles}
    />
  );
