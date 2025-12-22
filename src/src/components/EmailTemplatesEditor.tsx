import { useState } from 'react';
import { EmailTemplate, EmailConnector } from '../types';
import { EmailTemplateEditor } from './EmailTemplateEditor';
import { SmtpConnectorsEditor } from './SmtpConnectorsEditor';
import { Plus, Mail, Server, FileText, ChevronDown, ChevronRight } from 'lucide-react';

interface EmailTemplatesEditorProps {
  templates: EmailTemplate[];
  connectors: EmailConnector[];
  onAddTemplate: () => void;
  onUpdateTemplate: (id: string, template: EmailTemplate) => void;
  onRemoveTemplate: (id: string) => void;
  onAddConnector: () => void;
  onUpdateConnector: (id: string, connector: EmailConnector) => void;
  onRemoveConnector: (id: string) => void;
}

interface AccordionSectionProps {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  isOpen: boolean;
  onToggle: () => void;
  headerAction?: React.ReactNode;
  children: React.ReactNode;
}

function AccordionSection({
  title,
  subtitle,
  icon,
  isOpen,
  onToggle,
  headerAction,
  children,
}: AccordionSectionProps) {
  return (
    <div
      className="rounded-lg overflow-hidden"
      style={{
        backgroundColor: 'var(--bg-surface)',
        border: '1px solid var(--border-default)',
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between p-4 cursor-pointer select-none"
        style={{ backgroundColor: 'var(--bg-muted)' }}
        onClick={onToggle}
      >
        <div className="flex items-center gap-3">
          <div style={{ color: 'var(--accent-500)' }}>{icon}</div>
          <div>
            <h3
              className="text-lg font-bold"
              style={{ color: 'var(--text-primary)' }}
            >
              {title}
            </h3>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              {subtitle}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {headerAction && (
            <div onClick={(e) => e.stopPropagation()}>{headerAction}</div>
          )}
          <div style={{ color: 'var(--text-muted)' }}>
            {isOpen ? <ChevronDown size={24} /> : <ChevronRight size={24} />}
          </div>
        </div>
      </div>

      {/* Content */}
      {isOpen && (
        <div className="p-4">
          {children}
        </div>
      )}
    </div>
  );
}

export function EmailTemplatesEditor({
  templates,
  connectors,
  onAddTemplate,
  onUpdateTemplate,
  onRemoveTemplate,
  onAddConnector,
  onUpdateConnector,
  onRemoveConnector,
}: EmailTemplatesEditorProps) {
  const [connectorsOpen, setConnectorsOpen] = useState(true);
  const [templatesOpen, setTemplatesOpen] = useState(true);

  return (
    <div className="space-y-4">
      {/* SMTP Connectors Accordion */}
      <AccordionSection
        title="SMTP Connectors"
        subtitle={`${connectors.length} connector${connectors.length !== 1 ? 's' : ''} configured`}
        icon={<Server size={24} />}
        isOpen={connectorsOpen}
        onToggle={() => setConnectorsOpen(!connectorsOpen)}
        headerAction={
          <button onClick={onAddConnector} className="btn btn-success btn-sm">
            <Plus size={16} />
            <span>Add</span>
          </button>
        }
      >
        <SmtpConnectorsEditor
          connectors={connectors}
          onAdd={onAddConnector}
          onUpdate={onUpdateConnector}
          onRemove={onRemoveConnector}
          hideHeader
        />
      </AccordionSection>

      {/* Email Templates Accordion */}
      <AccordionSection
        title="Email Templates"
        subtitle={`${templates.length} template${templates.length !== 1 ? 's' : ''} configured`}
        icon={<FileText size={24} />}
        isOpen={templatesOpen}
        onToggle={() => setTemplatesOpen(!templatesOpen)}
        headerAction={
          <button onClick={onAddTemplate} className="btn btn-success btn-sm">
            <Plus size={16} />
            <span>Add</span>
          </button>
        }
      >
        <div className="space-y-6">
          {templates.length === 0 ? (
            <div
              className="p-8 rounded-lg text-center"
              style={{ backgroundColor: 'var(--bg-muted)' }}
            >
              <Mail
                size={48}
                className="mx-auto mb-3"
                style={{ color: 'var(--text-subtle)' }}
              />
              <p style={{ color: 'var(--text-muted)' }}>
                No email templates configured. Create templates with placeholders to
                automate email composition.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {templates.map((template) => (
                <EmailTemplateEditor
                  key={template.id}
                  template={template}
                  onChange={(updated) => onUpdateTemplate(template.id, updated)}
                  onRemove={() => onRemoveTemplate(template.id)}
                />
              ))}
            </div>
          )}

          {/* Help Section */}
          <div
            className="p-4 rounded-lg space-y-4"
            style={{
              backgroundColor: 'var(--bg-muted)',
              border: '1px solid var(--border-default)',
            }}
          >
            <div>
              <h4
                className="font-semibold mb-2"
                style={{ color: 'var(--text-primary)' }}
              >
                Using Placeholders
              </h4>
              <p
                className="text-sm mb-3"
                style={{ color: 'var(--text-secondary)' }}
              >
                Placeholders are replaced with actual values when the email is sent.
                Use the "Insert Variable" button in the editor or type them manually.
              </p>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                {[
                  { category: 'Contact', examples: ['contact.name', 'contact.email'] },
                  { category: 'Invoice', examples: ['invoice.number', 'invoice.amount'] },
                  { category: 'Invoices', examples: ['invoices.count', 'invoices.totalAmount'] },
                  { category: 'Customer', examples: ['customer.name', 'customer.ic'] },
                  { category: 'Supplier', examples: ['supplier.name', 'supplier.bankAccount'] },
                ].map((cat) => (
                  <div key={cat.category}>
                    <div
                      className="text-xs font-semibold mb-1"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      {cat.category}
                    </div>
                    {cat.examples.map((ex) => (
                      <code
                        key={ex}
                        className="block text-xs mb-0.5 px-1.5 py-0.5 rounded"
                        style={{
                          backgroundColor: 'var(--bg-surface)',
                          color: 'var(--accent-600)',
                        }}
                      >
                        {'{{'}{ex}{'}}'}
                      </code>
                    ))}
                  </div>
                ))}
              </div>
            </div>

            <div
              className="pt-4"
              style={{ borderTop: '1px solid var(--border-default)' }}
            >
              <h4
                className="font-semibold mb-2"
                style={{ color: 'var(--text-primary)' }}
              >
                Advanced: Eta Templating
              </h4>
              <p
                className="text-sm mb-3"
                style={{ color: 'var(--text-secondary)' }}
              >
                Use Eta syntax for conditionals, loops, and complex logic. Available helpers:{' '}
                <code className="text-xs px-1 py-0.5 rounded" style={{ backgroundColor: 'var(--bg-surface)', color: 'var(--accent-600)' }}>
                  plural(count, one, few, many)
                </code>,{' '}
                <code className="text-xs px-1 py-0.5 rounded" style={{ backgroundColor: 'var(--bg-surface)', color: 'var(--accent-600)' }}>
                  formatAmount(num, currency?)
                </code>
              </p>
              <div>
                <div
                  className="text-xs font-semibold mb-1"
                  style={{ color: 'var(--text-muted)' }}
                >
                  Conditional Example
                </div>
                <code
                  className="block text-xs p-2 rounded font-mono whitespace-pre-wrap"
                  style={{
                    backgroundColor: 'var(--bg-surface)',
                    color: 'var(--text-secondary)',
                  }}
                >
{`<% if (it.invoices.count > 1) { %>
  Invoices: <%= it.invoices.numbers %>
<% } else { %>
  Invoice n. <%= it.invoice.number %>
<% } %>`}
                </code>
              </div>
            </div>
          </div>
        </div>
      </AccordionSection>
    </div>
  );
}
