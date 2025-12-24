import { useState, useEffect, forwardRef, useImperativeHandle, useRef } from 'react';
import { Config, CompanyDetails, Contact, EmailTemplate, EmailConnector, Ruleset } from '../types';
import { saveConfig } from '../utils/config';
import { loadSmtpCredentials, saveSmtpCredentials, SmtpCredentials } from '../utils/smtpCredentials';
import { modal } from '../contexts/ModalContext';
import { ConfirmModal } from './modals/ConfirmModal';
import { PromptModal } from './modals/PromptModal';
import { APIKeysEditorRef } from './APIKeysEditor';
import { GeneralSettingsTab } from './GeneralSettingsTab';
import { CompanyListEditor } from './CompanyListEditor';
import { ContactsEditor } from './ContactsEditor';
import { RulesetsEditor } from './RulesetsEditor';
import { EmailTemplatesEditor } from './EmailTemplatesEditor';
import { HScrollArea } from './ScrollArea';
import { createDefaultTemplate } from '../utils/emailTemplates';
import { toast } from 'sonner';
import {
  Building2,
  Users,
  Layers,
  Settings2,
  Mail,
  LucideIcon
} from 'lucide-react';

// Settings tabs configuration - exported for use in mobile navigation
export type SettingsTabId = 'general' | 'supplier' | 'customers' | 'contacts' | 'emailTemplates' | 'rulesets';

export interface SettingsTab {
  id: SettingsTabId;
  label: string;
  icon: LucideIcon;
}

export const SETTINGS_TABS: SettingsTab[] = [
  { id: 'general', label: 'General', icon: Settings2 },
  { id: 'supplier', label: 'Suppliers', icon: Building2 },
  { id: 'customers', label: 'Customers', icon: Users },
  { id: 'contacts', label: 'Contacts', icon: Users },
  { id: 'emailTemplates', label: 'E-mails', icon: Mail },
  { id: 'rulesets', label: 'Rulesets', icon: Layers },
];

interface ConfigEditorProps {
  config: Config;
  onSave: (newConfig: Config) => void;
  onCancel: () => void;
  isVisible?: boolean;
  initialTab?: SettingsTabId;
}

export interface ConfigEditorRef {
  save: () => Promise<void>;
  setTab: (tab: SettingsTabId) => void;
}

const ConfigEditor = forwardRef<ConfigEditorRef, ConfigEditorProps>(({ config, onSave, isVisible, initialTab }, ref) => {
  const [localConfig, setLocalConfig] = useState<Config>(JSON.parse(JSON.stringify(config)));
  const activeTabRef = useRef<SettingsTabId>(initialTab ?? 'general');
  const [, forceUpdate] = useState({});
  
  const activeTab = activeTabRef.current;
  const setActiveTab = (tab: SettingsTabId) => {
    if (activeTabRef.current !== tab) {
      activeTabRef.current = tab;
      forceUpdate({});
    }
  };
  
  // Ref for API Keys editor (manages its own state)
  const apiKeysEditorRef = useRef<APIKeysEditorRef>(null);
  
  // Track previous visibility to detect open transition
  const wasVisibleRef = useRef(isVisible);

  // Reset local config only when OPENING settings (transitioning from hidden to visible)
  useEffect(() => {
    const wasVisible = wasVisibleRef.current;
    wasVisibleRef.current = isVisible;
    
    if (isVisible && !wasVisible) {
      // Load config and merge SMTP credentials
      const loadAndMerge = async () => {
        const credentials = await loadSmtpCredentials(config.rootPath);
        
        // Clone config and merge passwords into connectors
        const configClone = JSON.parse(JSON.stringify(config)) as Config;
        if (configClone.emailConnectors) {
          configClone.emailConnectors = configClone.emailConnectors.map(c => ({
            ...c,
            password: credentials[c.id] || c.password || ''
          }));
        }
        setLocalConfig(configClone);
      };
      loadAndMerge();
    }
  }, [isVisible, config]);

  const handleSave = async () => {
    try {
      // Extract SMTP passwords and save them encrypted separately
      const newCredentials: SmtpCredentials = {};
      const connectorsWithoutPasswords = (localConfig.emailConnectors || []).map(c => {
        if (c.password) {
          newCredentials[c.id] = c.password;
        }
        // Return connector without password for main config
        const { password: _, ...connectorWithoutPassword } = c;
        return { ...connectorWithoutPassword, password: '' };
      });
      
      // Save SMTP credentials encrypted
      await saveSmtpCredentials(localConfig.rootPath, newCredentials);
      
      // Save config without passwords
      const configToSave = {
        ...localConfig,
        emailConnectors: connectorsWithoutPasswords
      };
      await saveConfig(configToSave);
      
      // Save API keys via the editor's ref
      await apiKeysEditorRef.current?.save();
      toast.success('Settings saved successfully');
      onSave(localConfig); // Pass full config with passwords to parent for runtime use
    } catch (e) {
      toast.error('Failed to save settings: ' + e);
    }
  };

  // Expose functions to parent via ref
  useImperativeHandle(ref, () => ({
    save: handleSave,
    setTab: setActiveTab,
  }));

  // Company management
  const addCompany = async (isSupplier: boolean) => {
    const type = isSupplier ? 'Supplier' : 'Customer';
    const id = await modal.open(PromptModal, {
      title: `Add New ${type}`,
      message: `Enter a unique ID for this ${type.toLowerCase()} (e.g., "company1"):`,
      placeholder: 'my-company',
      confirmText: 'Create',
      cancelText: 'Cancel',
    });
    
    if (id) {
      // Validate the ID
      if (localConfig.companies.some(c => c.id === id)) {
        toast.error('This ID already exists');
        return;
      }
      if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
        toast.error('ID can only contain letters, numbers, hyphens and underscores');
        return;
      }
      
      const newCompany: CompanyDetails = {
        id,
        name: '',
        street: '',
        city: '',
        zip: '',
        country: '',
        ic: '',
        isSupplier
      };
      setLocalConfig({...localConfig, companies: [...localConfig.companies, newCompany]});
    }
  };

  const updateCompany = (id: string, company: CompanyDetails) => {
    setLocalConfig({
      ...localConfig,
      companies: localConfig.companies.map(c => c.id === id ? company : c)
    });
  };

  const removeCompany = async (id: string) => {
    const company = localConfig.companies.find(c => c.id === id);
    const confirmed = await modal.open(ConfirmModal, {
      title: 'Delete Company',
      message: `Are you sure you want to delete "${company?.name || id}"? This action cannot be undone.`,
      confirmText: 'Delete',
      cancelText: 'Cancel',
      variant: 'danger'
    });
    
    if (confirmed) {
      setLocalConfig({
        ...localConfig,
        companies: localConfig.companies.filter(c => c.id !== id)
      });
    }
  };

  // Contact management
  const addContact = async () => {
    const id = await modal.open(PromptModal, {
      title: 'Add New Contact',
      message: 'Enter a unique ID for this contact (e.g., "john-doe"):',
      placeholder: 'contact-1',
      confirmText: 'Create',
      cancelText: 'Cancel',
    });
    
    if (id) {
      // Validate the ID
      if ((localConfig.contacts || []).some(c => c.id === id)) {
        toast.error('This ID already exists');
        return;
      }
      if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
        toast.error('ID can only contain letters, numbers, hyphens and underscores');
        return;
      }
      
      const newContact: Contact = {
        id,
        name: '',
        email: ''
      };
      setLocalConfig({...localConfig, contacts: [...(localConfig.contacts || []), newContact]});
    }
  };

  const updateContact = (id: string, contact: Contact) => {
    setLocalConfig({
      ...localConfig,
      contacts: (localConfig.contacts || []).map(c => c.id === id ? contact : c)
    });
  };

  const removeContact = async (id: string) => {
    const contact = (localConfig.contacts || []).find(c => c.id === id);
    const confirmed = await modal.open(ConfirmModal, {
      title: 'Delete Contact',
      message: `Are you sure you want to delete "${contact?.name || id}"? This action cannot be undone.`,
      confirmText: 'Delete',
      cancelText: 'Cancel',
      variant: 'danger'
    });
    
    if (confirmed) {
      setLocalConfig({
        ...localConfig,
        contacts: (localConfig.contacts || []).filter(c => c.id !== id)
      });
    }
  };

  // Email template management
  const addEmailTemplate = async () => {
    const id = await modal.open(PromptModal, {
      title: 'Add New Email Template',
      message: 'Enter a unique ID for this template (e.g., "invoice-notification"):',
      placeholder: 'template-1',
      confirmText: 'Create',
      cancelText: 'Cancel',
    });
    
    if (id) {
      // Validate the ID
      if ((localConfig.emailTemplates || []).some(t => t.id === id)) {
        toast.error('This ID already exists');
        return;
      }
      if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
        toast.error('ID can only contain letters, numbers, hyphens and underscores');
        return;
      }
      
      const newTemplate = createDefaultTemplate(id);
      setLocalConfig({...localConfig, emailTemplates: [...(localConfig.emailTemplates || []), newTemplate]});
    }
  };

  const updateEmailTemplate = (id: string, template: EmailTemplate) => {
    setLocalConfig({
      ...localConfig,
      emailTemplates: (localConfig.emailTemplates || []).map(t => t.id === id ? template : t)
    });
  };

  const removeEmailTemplate = async (id: string) => {
    const template = (localConfig.emailTemplates || []).find(t => t.id === id);
    const confirmed = await modal.open(ConfirmModal, {
      title: 'Delete Email Template',
      message: `Are you sure you want to delete "${template?.name || id}"? This action cannot be undone.`,
      confirmText: 'Delete',
      cancelText: 'Cancel',
      variant: 'danger'
    });
    
    if (confirmed) {
      setLocalConfig({
        ...localConfig,
        emailTemplates: (localConfig.emailTemplates || []).filter(t => t.id !== id)
      });
    }
  };

  // Email connector (SMTP) management
  const addEmailConnector = async () => {
    const id = await modal.open(PromptModal, {
      title: 'Add New SMTP Connector',
      message: 'Enter a unique ID for this connector (e.g., "gmail-main"):',
      placeholder: 'smtp-1',
      confirmText: 'Create',
      cancelText: 'Cancel',
    });
    
    if (id) {
      // Validate the ID
      if ((localConfig.emailConnectors || []).some(c => c.id === id)) {
        toast.error('This ID already exists');
        return;
      }
      if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
        toast.error('ID can only contain letters, numbers, hyphens and underscores');
        return;
      }
      
      const newConnector: EmailConnector = {
        id,
        name: '',
        host: 'smtp.gmail.com',
        port: 587,
        secure: false,
        username: '',
        password: '',
        fromEmail: '',
      };
      setLocalConfig({...localConfig, emailConnectors: [...(localConfig.emailConnectors || []), newConnector]});
    }
  };

  const updateEmailConnector = (id: string, connector: EmailConnector) => {
    setLocalConfig({
      ...localConfig,
      emailConnectors: (localConfig.emailConnectors || []).map(c => c.id === id ? connector : c)
    });
  };

  const removeEmailConnector = async (id: string) => {
    const connector = (localConfig.emailConnectors || []).find(c => c.id === id);
    const confirmed = await modal.open(ConfirmModal, {
      title: 'Delete SMTP Connector',
      message: `Are you sure you want to delete "${connector?.name || id}"? This action cannot be undone.`,
      confirmText: 'Delete',
      cancelText: 'Cancel',
      variant: 'danger'
    });
    
    if (confirmed) {
      setLocalConfig({
        ...localConfig,
        emailConnectors: (localConfig.emailConnectors || []).filter(c => c.id !== id)
      });
    }
  };

  // Ruleset management
  const addRuleset = async () => {
    const id = await modal.open(PromptModal, {
      title: 'Add New Ruleset',
      message: 'Enter a unique ID for this ruleset (e.g., "main-client"):',
      placeholder: 'ruleset-1',
      confirmText: 'Create',
      cancelText: 'Cancel',
    });
    
    if (id) {
      // Validate the ID
      if ((localConfig.rulesets || []).some(r => r.id === id)) {
        toast.error('This ID already exists');
        return;
      }
      if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
        toast.error('ID can only contain letters, numbers, hyphens and underscores');
        return;
      }
      
      const newRuleset: Ruleset = {
        id,
        name: '',
        periodicity: 'monthly',
        entitlementDay: 5,
        salaryRules: [],
        rules: [],
        descriptions: [],
      };
      setLocalConfig({...localConfig, rulesets: [...(localConfig.rulesets || []), newRuleset]});
    }
  };

  const removeRuleset = async (id: string) => {
    const ruleset = (localConfig.rulesets || []).find(r => r.id === id);
    const confirmed = await modal.open(ConfirmModal, {
      title: 'Delete Ruleset',
      message: `Are you sure you want to delete "${ruleset?.name || id}"? This action cannot be undone.`,
      confirmText: 'Delete',
      cancelText: 'Cancel',
      variant: 'danger'
    });
    
    if (confirmed) {
      setLocalConfig({
        ...localConfig,
        rulesets: (localConfig.rulesets || []).filter(r => r.id !== id)
      });
    }
  };

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8">
      {/* Tab Navigation */}
      <HScrollArea className="tab-list-scroll mb-6 -mx-4 px-4 sm:mx-0 sm:px-0">
        <div className="tab-list">
          {SETTINGS_TABS.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`tab-button flex items-center gap-2 ${activeTab === tab.id ? 'active' : ''}`}
              >
                <Icon size={18} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </HScrollArea>

      {/* Tab Content */}
      <div className="card -mx-4 sm:mx-0 rounded-none sm:rounded-lg p-4 sm:p-6 lg:p-8">
        {activeTab === 'general' && (
          <GeneralSettingsTab
            config={localConfig}
            onChange={setLocalConfig}
            apiKeysRef={apiKeysEditorRef}
          />
        )}

        {activeTab === 'supplier' && (
          <CompanyListEditor 
            companies={localConfig.companies.filter(c => c.isSupplier)} 
            onAdd={() => addCompany(true)}
            onUpdate={updateCompany}
            onRemove={removeCompany}
            title="Suppliers"
            emptyMessage="No suppliers configured. Add your company details to start generating invoices."
          />
        )}

        {activeTab === 'customers' && (
          <CompanyListEditor 
            companies={localConfig.companies.filter(c => !c.isSupplier)} 
            contacts={localConfig.contacts || []}
            emailTemplates={localConfig.emailTemplates || []}
            emailConnectors={localConfig.emailConnectors || []}
            onAdd={() => addCompany(false)}
            onUpdate={updateCompany}
            onRemove={removeCompany}
            title="Customers"
            emptyMessage="No customers configured. Add your clients to generate invoices for them."
          />
        )}

        {activeTab === 'contacts' && (
          <ContactsEditor 
            contacts={localConfig.contacts || []}
            onAdd={addContact}
            onUpdate={updateContact}
            onRemove={removeContact}
          />
        )}

        {activeTab === 'emailTemplates' && (
          <EmailTemplatesEditor
            templates={localConfig.emailTemplates || []}
            connectors={localConfig.emailConnectors || []}
            onAddTemplate={addEmailTemplate}
            onUpdateTemplate={updateEmailTemplate}
            onRemoveTemplate={removeEmailTemplate}
            onAddConnector={addEmailConnector}
            onUpdateConnector={updateEmailConnector}
            onRemoveConnector={removeEmailConnector}
          />
        )}

        {activeTab === 'rulesets' && (
          <RulesetsEditor 
            rulesets={localConfig.rulesets}
            companies={localConfig.companies}
            primaryCurrency={localConfig.primaryCurrency}
            onChange={rulesets => setLocalConfig({...localConfig, rulesets})}
            onAdd={addRuleset}
            onRemove={removeRuleset}
          />
        )}
      </div>
    </div>
  );
});

export default ConfigEditor;
