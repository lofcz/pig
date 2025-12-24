import { useState, useEffect, useCallback, useMemo } from 'react';
import { Config } from '../../types';
import { GeneratedInvoice, EmailTask, ModalPhase } from './types';

interface UseEmailTasksProps {
  phase: ModalPhase;
  config?: Config;
  generatedInvoices: GeneratedInvoice[];
}

interface UseEmailTasksReturn {
  emailTasks: EmailTask[];
  currentTaskIndex: number;
  currentTask: EmailTask | undefined;
  sentCount: number;
  skippedCount: number;
  allEmailsDone: boolean;
  setCurrentTaskIndex: (index: number) => void;
  updateTaskStatus: (index: number, status: EmailTask['status']) => void;
  resetEmailTasks: () => void;
  moveToNextTask: () => boolean; // Returns true if there's a next task
}

export function useEmailTasks({
  phase,
  config,
  generatedInvoices,
}: UseEmailTasksProps): UseEmailTasksReturn {
  const [emailTasks, setEmailTasks] = useState<EmailTask[]>([]);
  const [currentTaskIndex, setCurrentTaskIndex] = useState(0);

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
        .filter((c): c is NonNullable<typeof c> => !!c);

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

  const updateTaskStatus = useCallback((index: number, status: EmailTask['status']) => {
    setEmailTasks(prev => prev.map((t, i) => 
      i === index ? { ...t, status } : t
    ));
  }, []);

  const moveToNextTask = useCallback((): boolean => {
    if (currentTaskIndex < emailTasks.length - 1) {
      setCurrentTaskIndex(prev => prev + 1);
      return true;
    }
    return false;
  }, [currentTaskIndex, emailTasks.length]);

  const resetEmailTasks = useCallback(() => {
    setEmailTasks([]);
    setCurrentTaskIndex(0);
  }, []);

  // Computed values
  const sentCount = useMemo(() => 
    emailTasks.filter(t => t.status === 'sent').length, 
    [emailTasks]
  );

  const skippedCount = useMemo(() => 
    emailTasks.filter(t => t.status === 'skipped').length, 
    [emailTasks]
  );

  const allEmailsDone = useMemo(() => 
    emailTasks.length > 0 && emailTasks.every(t => t.status === 'sent' || t.status === 'skipped'),
    [emailTasks]
  );

  const currentTask = emailTasks[currentTaskIndex];

  return {
    emailTasks,
    currentTaskIndex,
    currentTask,
    sentCount,
    skippedCount,
    allEmailsDone,
    setCurrentTaskIndex,
    updateTaskStatus,
    resetEmailTasks,
    moveToNextTask,
  };
}
