import { useRef } from 'react';
import { Editor, EditorContent } from '@tiptap/react';
import { 
  ChevronLeft, 
  SkipForward, 
  Send, 
  Loader2,
  Paperclip,
  Plus,
  FileText,
  ExternalLink,
  Trash2,
  Archive,
  Bold,
  Italic,
  Strikethrough,
  List,
  ListOrdered,
  Undo,
  Redo,
  Palette,
  Highlighter
} from 'lucide-react';
import ColorSwatchPicker from './ColorSwatchPicker';
import { TEXT_COLORS, HIGHLIGHT_COLORS } from './constants';
import { EmailTask, AttachmentItem } from './types';
import { formatFileSize } from './utils';

interface EmailComposePhaseProps {
  currentTask: EmailTask;
  currentTaskIndex: number;
  totalTasks: number;
  subject: string;
  onSubjectChange: (subject: string) => void;
  editor: Editor | null;
  attachments: AttachmentItem[];
  sendingEmail: boolean;
  activeColorPicker: 'text' | 'highlight' | null;
  onSetActiveColorPicker: (picker: 'text' | 'highlight' | null) => void;
  onBackToList: () => void;
  onSkipEmail: () => void;
  onSendEmail: () => void;
  onAddAttachment: () => void;
  onRemoveAttachment: (id: string) => void;
  onRemoveAllBundledExtras: () => void;
  onOpenFile: (path: string) => void;
  onOpenExtrasZip: () => void;
}

export default function EmailComposePhase({
  currentTask,
  currentTaskIndex,
  totalTasks,
  subject,
  onSubjectChange,
  editor,
  attachments,
  sendingEmail,
  activeColorPicker,
  onSetActiveColorPicker,
  onBackToList,
  onSkipEmail,
  onSendEmail,
  onAddAttachment,
  onRemoveAttachment,
  onRemoveAllBundledExtras,
  onOpenFile,
  onOpenExtrasZip,
}: EmailComposePhaseProps) {
  const attachmentsContainerRef = useRef<HTMLDivElement>(null);

  // Separate attachments by type
  const invoiceAttachments = attachments.filter(a => a.isInvoice);
  const autoExtraAttachments = attachments.filter(a => !a.isInvoice && a.id.startsWith('extra-'));
  const customAttachments = attachments.filter(a => !a.isInvoice && a.id.startsWith('custom-'));

  return (
    <div className="generate-all-composer">
      {/* Header */}
      <div className="composer-header">
        <button 
          onClick={onBackToList}
          className="btn btn-ghost btn-icon"
          disabled={sendingEmail}
        >
          <ChevronLeft size={20} />
        </button>
        <div className="composer-header-info">
          <h3 className="composer-title">
            Compose Email ({currentTaskIndex + 1}/{totalTasks})
          </h3>
          <p className="composer-subtitle">
            To: {currentTask.contact.name} &lt;{currentTask.contact.email}&gt;
          </p>
        </div>
        <button
          onClick={onSkipEmail}
          disabled={sendingEmail}
          className="btn btn-ghost btn-sm"
        >
          <SkipForward size={16} />
          <span>Skip</span>
        </button>
      </div>

      {/* Subject */}
      <div className="composer-section">
        <label className="composer-label">Subject</label>
        <input
          type="text"
          value={subject}
          onChange={(e) => onSubjectChange(e.target.value)}
          placeholder="Email subject..."
          className="w-full"
          disabled={sendingEmail}
        />
      </div>

      {/* Body with WYSIWYG Toolbar */}
      <div className="composer-section composer-body-section">
        <label className="composer-label">Message</label>
        
        {/* Toolbar */}
        <div className="composer-toolbar">
          <div className="composer-toolbar-group">
            <button
              type="button"
              onClick={() => editor?.chain().focus().toggleBold().run()}
              className={`composer-toolbar-btn ${editor?.isActive('bold') ? 'active' : ''}`}
              title="Bold"
            >
              <Bold size={16} />
            </button>
            <button
              type="button"
              onClick={() => editor?.chain().focus().toggleItalic().run()}
              className={`composer-toolbar-btn ${editor?.isActive('italic') ? 'active' : ''}`}
              title="Italic"
            >
              <Italic size={16} />
            </button>
            <button
              type="button"
              onClick={() => editor?.chain().focus().toggleStrike().run()}
              className={`composer-toolbar-btn ${editor?.isActive('strike') ? 'active' : ''}`}
              title="Strikethrough"
            >
              <Strikethrough size={16} />
            </button>
          </div>

          <div className="composer-toolbar-divider" />

          <div className="composer-toolbar-group">
            <div className="composer-color-picker-wrapper">
              <button
                type="button"
                onClick={() => onSetActiveColorPicker(activeColorPicker === 'text' ? null : 'text')}
                className={`composer-toolbar-btn ${activeColorPicker === 'text' ? 'active' : ''}`}
                title="Text Color"
              >
                <Palette size={16} />
              </button>
              {activeColorPicker === 'text' && (
                <ColorSwatchPicker
                  colors={TEXT_COLORS}
                  currentColor={editor?.getAttributes('textStyle').color || ''}
                  onSelect={(color) => {
                    if (color) {
                      editor?.chain().focus().setColor(color).run();
                    } else {
                      editor?.chain().focus().unsetColor().run();
                    }
                  }}
                  onClose={() => onSetActiveColorPicker(null)}
                  type="text"
                />
              )}
            </div>
            <div className="composer-color-picker-wrapper">
              <button
                type="button"
                onClick={() => onSetActiveColorPicker(activeColorPicker === 'highlight' ? null : 'highlight')}
                className={`composer-toolbar-btn ${activeColorPicker === 'highlight' ? 'active' : ''}`}
                title="Highlight Color"
              >
                <Highlighter size={16} />
              </button>
              {activeColorPicker === 'highlight' && (
                <ColorSwatchPicker
                  colors={HIGHLIGHT_COLORS}
                  currentColor={editor?.getAttributes('highlight').color || ''}
                  onSelect={(color) => {
                    if (color) {
                      editor?.chain().focus().toggleHighlight({ color }).run();
                    } else {
                      editor?.chain().focus().unsetHighlight().run();
                    }
                  }}
                  onClose={() => onSetActiveColorPicker(null)}
                  type="highlight"
                />
              )}
            </div>
          </div>

          <div className="composer-toolbar-divider" />

          <div className="composer-toolbar-group">
            <button
              type="button"
              onClick={() => editor?.chain().focus().toggleBulletList().run()}
              className={`composer-toolbar-btn ${editor?.isActive('bulletList') ? 'active' : ''}`}
              title="Bullet List"
            >
              <List size={16} />
            </button>
            <button
              type="button"
              onClick={() => editor?.chain().focus().toggleOrderedList().run()}
              className={`composer-toolbar-btn ${editor?.isActive('orderedList') ? 'active' : ''}`}
              title="Numbered List"
            >
              <ListOrdered size={16} />
            </button>
          </div>

          <div className="composer-toolbar-divider" />

          <div className="composer-toolbar-group">
            <button
              type="button"
              onClick={() => editor?.chain().focus().undo().run()}
              disabled={!editor?.can().undo()}
              className="composer-toolbar-btn"
              title="Undo"
            >
              <Undo size={16} />
            </button>
            <button
              type="button"
              onClick={() => editor?.chain().focus().redo().run()}
              disabled={!editor?.can().redo()}
              className="composer-toolbar-btn"
              title="Redo"
            >
              <Redo size={16} />
            </button>
          </div>
        </div>

        {/* Editor */}
        <div className="composer-editor">
          <EditorContent editor={editor} className="composer-editor-content" />
        </div>
      </div>

      {/* Attachments */}
      <div className="composer-section">
        <div className="composer-attachments-header">
          <label className="composer-label">
            <Paperclip size={14} />
            Attachments ({invoiceAttachments.length + (autoExtraAttachments.length > 0 ? 1 : 0) + customAttachments.length})
          </label>
          <button
            onClick={onAddAttachment}
            disabled={sendingEmail}
            className="composer-add-attachment"
          >
            <Plus size={12} />
            Add Extra
          </button>
        </div>
        
        {attachments.length === 0 ? (
          <div className="composer-no-attachments">
            <Paperclip size={20} />
            <span>No attachments - invoices will be attached automatically</span>
          </div>
        ) : (
          <div className="composer-attachments" ref={attachmentsContainerRef}>
            {/* Invoice attachments (standalone) */}
            {invoiceAttachments.map((att) => (
              <div key={att.id} className="composer-attachment">
                <FileText size={14} style={{ color: 'var(--accent-500)' }} />
                <span className="composer-attachment-name">{att.filename}</span>
                <span className="composer-attachment-size">{formatFileSize(att.size)}</span>
                <button
                  onClick={() => onOpenFile(att.path)}
                  className="composer-attachment-action"
                  title="Open"
                >
                  <ExternalLink size={12} />
                </button>
                <button
                  onClick={() => onRemoveAttachment(att.id)}
                  disabled={sendingEmail}
                  className="composer-attachment-action delete"
                  title="Remove"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
            
            {/* Auto-added extras (bundled into extra.zip) */}
            {autoExtraAttachments.length > 0 && (
              <div className="composer-attachment">
                <Archive size={14} style={{ color: 'var(--accent-500)' }} />
                <span className="composer-attachment-name">
                  extra.zip ({autoExtraAttachments.length} document{autoExtraAttachments.length !== 1 ? 's' : ''})
                </span>
                <span className="composer-attachment-size">
                  {formatFileSize(autoExtraAttachments.reduce((sum, a) => sum + a.size, 0))}
                </span>
                <button
                  onClick={onOpenExtrasZip}
                  className="composer-attachment-action"
                  title="Open"
                >
                  <ExternalLink size={12} />
                </button>
                <button
                  onClick={onRemoveAllBundledExtras}
                  disabled={sendingEmail}
                  className="composer-attachment-action delete"
                  title="Remove all bundled extras"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            )}
            
            {/* Custom-added attachments (standalone) */}
            {customAttachments.map((att) => (
              <div key={att.id} className="composer-attachment">
                <FileText size={14} style={{ color: 'var(--accent-500)' }} />
                <span className="composer-attachment-name">{att.filename}</span>
                <span className="composer-attachment-size">{formatFileSize(att.size)}</span>
                <button
                  onClick={() => onOpenFile(att.path)}
                  className="composer-attachment-action"
                  title="Open"
                >
                  <ExternalLink size={12} />
                </button>
                <button
                  onClick={() => onRemoveAttachment(att.id)}
                  disabled={sendingEmail}
                  className="composer-attachment-action delete"
                  title="Remove"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="composer-actions">
        <button
          onClick={onBackToList}
          disabled={sendingEmail}
          className="btn btn-secondary"
        >
          Cancel
        </button>
        <button
          onClick={onSendEmail}
          disabled={sendingEmail || !subject.trim()}
          className="btn btn-primary"
        >
          {sendingEmail ? (
            <>
              <Loader2 size={18} className="animate-spin" />
              <span>Sending...</span>
            </>
          ) : (
            <>
              <Send size={18} />
              <span>Send Email</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
