import { useState, useEffect, forwardRef, useImperativeHandle, useRef } from 'react';
import { Config, CompanyDetails, Contact, EmailTemplate } from '../types';
import { saveConfig } from '../utils/config';
import { useConfirm } from '../contexts/ConfirmModalContext';
import { usePrompt } from '../contexts/PromptModalContext';
import { APIKeysEditorRef } from './APIKeysEditor';
import { GeneralSettingsTab } from './GeneralSettingsTab';
import { CompanyListEditor } from './CompanyListEditor';
import { ContactsEditor } from './ContactsEditor';
import { RulesetsEditor } from './RulesetsEditor';
import { EmailTemplatesEditor } from './EmailTemplatesEditor';
import { createDefaultTemplate } from '../utils/emailTemplates';
import { toast } from 'sonner';
import {
  Building2,
  Users,
  Layers,
  Settings2,
  Mail
} from 'lucide-react';

interface ConfigEditorProps {
  config: Config;
  onSave: (newConfig: Config) => void;
  onCancel: () => void;
  isVisible?: boolean;
}

export interface ConfigEditorRef {
  save: () => Promise<void>;
}

const ConfigEditor = forwardRef<ConfigEditorRef, ConfigEditorProps>(({ config, onSave, isVisible }, ref) => {
  const [localConfig, setLocalConfig] = useState<Config>(JSON.parse(JSON.stringify(config)));
  const [activeTab, setActiveTab] = useState<'general' | 'supplier' | 'customers' | 'contacts' | 'emailTemplates' | 'rulesets'>('general');
  const confirm = useConfirm();
  const prompt = usePrompt();
  
  // Ref for API Keys editor (manages its own state)
  const apiKeysEditorRef = useRef<APIKeysEditorRef>(null);
  
  // Track previous visibility to detect open transition
  const wasVisibleRef = useRef(isVisible);

  // Reset local config only when OPENING settings (transitioning from hidden to visible)
  useEffect(() => {
    const wasVisible = wasVisibleRef.current;
    wasVisibleRef.current = isVisible;
    
    if (isVisible && !wasVisible) {
      setLocalConfig(JSON.parse(JSON.stringify(config)));
    }
  }, [isVisible, config]);

  const handleSave = async () => {
    try {
      await saveConfig(localConfig);
      // Save API keys via the editor's ref
      await apiKeysEditorRef.current?.save();
      toast.success('Settings saved successfully');
      onSave(localConfig);
    } catch (e) {
      toast.error('Failed to save settings: ' + e);
    }
  };

  // Expose save function to parent via ref
  useImperativeHandle(ref, () => ({
    save: handleSave
  }));

  // Company management
  const addCompany = async (isSupplier: boolean) => {
    const type = isSupplier ? 'Supplier' : 'Customer';
    const id = await prompt({
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
    const confirmed = await confirm({
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
    const id = await prompt({
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
    const confirmed = await confirm({
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
    const id = await prompt({
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
    const confirmed = await confirm({
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

  // Tab configuration
  const tabs = [
    { id: 'general' as const, label: 'General', icon: Settings2 },
    { id: 'supplier' as const, label: 'Suppliers', icon: Building2 },
    { id: 'customers' as const, label: 'Customers', icon: Users },
    { id: 'contacts' as const, label: 'Contacts', icon: Users },
    { id: 'emailTemplates' as const, label: 'E-mails', icon: Mail },
    { id: 'rulesets' as const, label: 'Rulesets', icon: Layers },
  ];

  return (
    <div className="p-6 lg:p-8">
      {/* Tab Navigation */}
      <div className="tab-list mb-6">
        {tabs.map((tab) => {
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

      {/* Tab Content */}
      <div className="card p-6 lg:p-8">
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
            emailTemplates={localConfig.emailTemplates || []}
            onAdd={addContact}
            onUpdate={updateContact}
            onRemove={removeContact}
          />
        )}

        {activeTab === 'emailTemplates' && (
          <EmailTemplatesEditor
            templates={localConfig.emailTemplates || []}
            onAdd={addEmailTemplate}
            onUpdate={updateEmailTemplate}
            onRemove={removeEmailTemplate}
          />
        )}

        {activeTab === 'rulesets' && (
          <RulesetsEditor 
            rulesets={localConfig.rulesets}
            companies={localConfig.companies}
            primaryCurrency={localConfig.primaryCurrency}
            onChange={rulesets => setLocalConfig({...localConfig, rulesets})}
          />
        )}
      </div>
    </div>
  );
});

export default ConfigEditor;
