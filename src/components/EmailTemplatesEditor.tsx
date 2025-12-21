import { EmailTemplate } from '../types';
import { EmailTemplateEditor } from './EmailTemplateEditor';
import { Plus, Mail } from 'lucide-react';

interface EmailTemplatesEditorProps {
  templates: EmailTemplate[];
  onAdd: () => void;
  onUpdate: (id: string, template: EmailTemplate) => void;
  onRemove: (id: string) => void;
}

export function EmailTemplatesEditor({
  templates,
  onAdd,
  onUpdate,
  onRemove,
}: EmailTemplatesEditorProps) {
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h3
            className="text-lg font-bold"
            style={{ color: 'var(--text-primary)' }}
          >
            E-mails
          </h3>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            {templates.length} template{templates.length !== 1 ? 's' : ''} configured
          </p>
        </div>
        <button onClick={onAdd} className="btn btn-success">
          <Plus size={18} />
          <span>Add Template</span>
        </button>
      </div>

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
              onChange={(updated) => onUpdate(template.id, updated)}
              onRemove={() => onRemove(template.id)}
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
  );
}

