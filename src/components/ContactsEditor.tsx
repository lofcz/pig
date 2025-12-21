import { Contact, EmailTemplate } from '../types';
import { Select, SelectOption, findOption } from './Select';
import {
  Plus,
  Trash2,
  Mail,
  Phone,
  FileText
} from 'lucide-react';

interface ContactsEditorProps {
  contacts: Contact[];
  emailTemplates?: EmailTemplate[];
  onAdd: () => void;
  onUpdate: (id: string, c: Contact) => void;
  onRemove: (id: string) => void;
}

export function ContactsEditor({ contacts, emailTemplates = [], onAdd, onUpdate, onRemove }: ContactsEditorProps) {
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h3 
            className="text-lg font-bold"
            style={{ color: 'var(--text-primary)' }}
          >
            Contacts
          </h3>
          <p 
            className="text-sm"
            style={{ color: 'var(--text-muted)' }}
          >
            {contacts.length} contact{contacts.length !== 1 ? 's' : ''} configured
          </p>
        </div>
        <button onClick={onAdd} className="btn btn-success">
          <Plus size={18} />
          <span>Add Contact</span>
        </button>
      </div>

      {contacts.length === 0 ? (
        <div 
          className="p-8 rounded-lg text-center"
          style={{ backgroundColor: 'var(--bg-muted)' }}
        >
          <Mail size={48} className="mx-auto mb-3" style={{ color: 'var(--text-subtle)' }} />
          <p style={{ color: 'var(--text-muted)' }}>
            No contacts configured. Add contacts to assign them to customers for automated emails.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
          {contacts.map((contact) => (
            <ContactCard 
              key={contact.id} 
              contact={contact}
              emailTemplates={emailTemplates}
              onChange={newC => onUpdate(contact.id, newC)} 
              onRemove={() => onRemove(contact.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface ContactCardProps {
  contact: Contact;
  emailTemplates: EmailTemplate[];
  onChange: (c: Contact) => void;
  onRemove: () => void;
}

function ContactCard({ contact, emailTemplates, onChange, onRemove }: ContactCardProps) {
  const update = (field: keyof Contact, val: any) => onChange({ ...contact, [field]: val });

  const selectedTemplate = emailTemplates.find(t => t.id === contact.emailTemplateId);

  // Build template options for select
  const templateOptions: SelectOption<string>[] = emailTemplates.map(t => ({
    value: t.id,
    label: t.name || t.id,
  }));

  return (
    <div className="card p-5 space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <span className="badge badge-primary">
            {contact.id}
          </span>
        </div>
        <button 
          onClick={onRemove} 
          className="btn btn-ghost btn-icon"
          style={{ color: 'var(--error-500)' }}
        >
          <Trash2 size={18} />
        </button>
      </div>
      
      <div>
        <label 
          className="text-xs font-semibold uppercase tracking-wide mb-1 block"
          style={{ color: 'var(--text-muted)' }}
        >
          Name
        </label>
        <input 
          value={contact.name} 
          onChange={e => update('name', e.target.value)} 
          placeholder="Contact name"
        />
      </div>

      <div>
        <label 
          className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide mb-1"
          style={{ color: 'var(--text-muted)' }}
        >
          <Mail size={12} />
          Email
        </label>
        <input 
          type="email"
          value={contact.email} 
          onChange={e => update('email', e.target.value)}
          placeholder="email@example.com"
        />
      </div>

      <div>
        <label 
          className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide mb-1"
          style={{ color: 'var(--text-muted)' }}
        >
          <Phone size={12} />
          Phone
          <span className="font-normal normal-case" style={{ color: 'var(--text-subtle)' }}>(optional)</span>
        </label>
        <input 
          type="tel"
          value={contact.phone || ''} 
          onChange={e => update('phone', e.target.value || undefined)}
          placeholder="+420 123 456 789"
        />
      </div>

      <div>
        <label 
          className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide mb-1"
          style={{ color: 'var(--text-muted)' }}
        >
          <FileText size={12} />
          Email Template
          <span className="font-normal normal-case" style={{ color: 'var(--text-subtle)' }}>(optional)</span>
        </label>
        <Select
          options={templateOptions}
          value={findOption(templateOptions, contact.emailTemplateId)}
          onChange={(opt) => update('emailTemplateId', opt?.value || undefined)}
          placeholder="No template"
          isClearable
        />
        {selectedTemplate && (
          <p 
            className="text-xs mt-1"
            style={{ color: 'var(--text-subtle)' }}
          >
            Subject: {selectedTemplate.subject || '(empty)'}
          </p>
        )}
      </div>
    </div>
  );
}

