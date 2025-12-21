import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import PlaceholderExtension from '@tiptap/extension-placeholder';
import { Node as TiptapNode, Mark, mergeAttributes } from '@tiptap/core';
import { EmailTemplate } from '../types';
import { PLACEHOLDER_CATEGORIES, getAllPlaceholders } from '../utils/emailTemplates';
import { useState, useRef, useCallback, useEffect } from 'react';
import Editor from '@monaco-editor/react';
import { useTheme } from '../contexts/ThemeContext';
import { html as beautifyHtml } from 'js-beautify';
import {
  Bold,
  Italic,
  Strikethrough,
  List,
  ListOrdered,
  Quote,
  Undo,
  Redo,
  ChevronDown,
  Variable,
  Heading1,
  Heading2,
  Heading3,
  Trash2,
  Code,
  Eye,
} from 'lucide-react';

// Custom Div node that preserves all attributes
const DivNode = TiptapNode.create({
  name: 'div',
  group: 'block',
  content: 'block*',
  
  addAttributes() {
    return {
      style: { default: null },
      class: { default: null },
    };
  },

  parseHTML() {
    return [{ tag: 'div' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes), 0];
  },
});

// Custom Span node that preserves all attributes
const SpanNode = TiptapNode.create({
  name: 'span',
  group: 'inline',
  inline: true,
  content: 'inline*',

  addAttributes() {
    return {
      style: { default: null },
      class: { default: null },
    };
  },

  parseHTML() {
    return [{ tag: 'span' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes), 0];
  },
});

// Custom style mark for inline styles
const StyleMark = Mark.create({
  name: 'style',

  addAttributes() {
    return {
      style: { default: null },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'span[style]',
        getAttrs: (element) => {
          const style = (element as HTMLElement).getAttribute('style');
          return style ? { style } : false;
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes), 0];
  },
});

interface EmailTemplateEditorProps {
  template: EmailTemplate;
  onChange: (template: EmailTemplate) => void;
  onRemove: () => void;
}

// Ensure body is a string (handles migration from old TipTap JSON format)
function getBodyAsString(body: any): string {
  if (typeof body === 'string') return body;
  if (!body) return '';
  // If it's an old TipTap JSON object, return empty string (will be migrated on save)
  return '';
}

// Unescape Eta syntax that TipTap escapes
function unescapeEtaSyntax(html: string): string {
  return html
    .replace(/&lt;%/g, '<%')
    .replace(/%&gt;/g, '%>');
}

export function EmailTemplateEditor({ template, onChange, onRemove }: EmailTemplateEditorProps) {
  const [showPlaceholderMenu, setShowPlaceholderMenu] = useState(false);
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  const [editorMode, setEditorMode] = useState<'wysiwyg' | 'html'>('wysiwyg');
  const initialBody = getBodyAsString(template.body);
  const [htmlContent, setHtmlContent] = useState<string>(initialBody);
  const menuRef = useRef<HTMLDivElement>(null);
  const { resolvedTheme } = useTheme();
  // Track if we're in the middle of switching modes (to prevent TipTap onUpdate from overwriting HTML)
  const isSwitchingModeRef = useRef(false);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3],
        },
      }),
      PlaceholderExtension.configure({
        placeholder: 'Compose your email template here...',
      }),
      // Custom nodes to support arbitrary HTML
      DivNode,
      SpanNode,
      StyleMark,
    ],
    content: initialBody, // TipTap can parse HTML strings
    onUpdate: ({ editor }) => {
      // Don't save when switching modes - only save actual user edits
      if (editorMode === 'wysiwyg' && !isSwitchingModeRef.current) {
        // Save as HTML string, unescape Eta syntax
        onChange({
          ...template,
          body: unescapeEtaSyntax(editor.getHTML()),
        });
      }
    },
  });

  // Close menu on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowPlaceholderMenu(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const insertPlaceholder = (key: string, _label: string) => {
    if (editorMode === 'wysiwyg') {
      // Insert as text with placeholder syntax
      editor?.chain().focus().insertContent(`{{${key}}}`).run();
    } else {
      // Insert placeholder in HTML mode
      setHtmlContent((prev) => prev + `{{${key}}}`);
    }
    setShowPlaceholderMenu(false);
  };

  const handleModeSwitch = useCallback((newMode: 'wysiwyg' | 'html') => {
    if (newMode === editorMode) return;

    if (newMode === 'html') {
      // Switching to HTML: use the stored template.body (preserves custom HTML)
      // Only fall back to TipTap if we were editing in Visual mode
      const rawHtml = typeof template.body === 'string' ? template.body : '';
      const formatted = beautifyHtml(rawHtml, {
        indent_size: 2,
        wrap_line_length: 80,
        preserve_newlines: true,
        max_preserve_newlines: 2,
        unformatted: ['b', 'i', 'em', 'strong', 'span', 'a'],
        content_unformatted: ['pre', 'code'],
      });
      setHtmlContent(formatted);
    } else {
      // Switching to WYSIWYG: load HTML into TipTap for preview
      // Set flag to prevent onUpdate from overwriting the stored HTML
      isSwitchingModeRef.current = true;
      if (editor) {
        editor.commands.setContent(htmlContent);
      }
      // Save the raw HTML from Monaco (preserves arbitrary HTML)
      onChange({
        ...template,
        body: htmlContent,
      });
      // Reset flag after a tick (after TipTap's onUpdate has fired)
      setTimeout(() => {
        isSwitchingModeRef.current = false;
      }, 0);
    }
    setEditorMode(newMode);
  }, [editorMode, editor, htmlContent, onChange, template.body]);

  const handleHtmlChange = useCallback((value: string | undefined) => {
    const newHtml = value || '';
    setHtmlContent(newHtml);
    // Save HTML directly to template body
    onChange({
      ...template,
      body: newHtml,
    });
  }, [template, onChange]);

  if (!editor) return null;

  return (
    <div className="card p-5 space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <span className="badge badge-primary mb-2">{template.id}</span>
        </div>
        <button
          onClick={onRemove}
          className="btn btn-ghost btn-icon"
          style={{ color: 'var(--error-500)' }}
          title="Delete template"
        >
          <Trash2 size={18} />
        </button>
      </div>

      {/* Template Name */}
      <div>
        <label
          className="text-xs font-semibold uppercase tracking-wide mb-1 block"
          style={{ color: 'var(--text-muted)' }}
        >
          Template Name
        </label>
        <input
          value={template.name}
          onChange={(e) => onChange({ ...template, name: e.target.value })}
          placeholder="e.g., Invoice Notification"
        />
      </div>

      {/* Subject Line */}
      <div>
        <label
          className="text-xs font-semibold uppercase tracking-wide mb-1 block"
          style={{ color: 'var(--text-muted)' }}
        >
          Subject Line
          <span
            className="font-normal normal-case ml-2"
            style={{ color: 'var(--text-subtle)' }}
          >
            (use {'{{placeholder}}'} syntax)
          </span>
        </label>
        <input
          value={template.subject}
          onChange={(e) => onChange({ ...template, subject: e.target.value })}
          placeholder="e.g., Invoice {{invoice.number}} - {{supplier.name}}"
        />
        <div className="mt-1 flex flex-wrap gap-1">
          {getAllPlaceholders()
            .filter((p) => p.key.startsWith('invoice') || p.key.startsWith('supplier'))
            .slice(0, 5)
            .map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() =>
                  onChange({
                    ...template,
                    subject: template.subject + `{{${p.key}}}`,
                  })
                }
                className="text-xs px-2 py-0.5 rounded"
                style={{
                  background: 'var(--bg-muted)',
                  color: 'var(--text-muted)',
                }}
              >
                +{p.label}
              </button>
            ))}
        </div>
      </div>

      {/* Email Body */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <label
            className="text-xs font-semibold uppercase tracking-wide"
            style={{ color: 'var(--text-muted)' }}
          >
            Email Body
          </label>
          
          {/* Mode Toggle */}
          <div
            className="inline-flex rounded-md border"
            style={{ 
              borderColor: 'var(--border-default)',
              backgroundColor: 'var(--bg-surface)',
            }}
          >
            <button
              onClick={() => handleModeSwitch('wysiwyg')}
              className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-l-md border-r"
              style={{
                backgroundColor: editorMode === 'wysiwyg' ? 'var(--accent-500)' : 'transparent',
                color: editorMode === 'wysiwyg' ? '#fff' : 'var(--text-muted)',
                borderColor: 'var(--border-default)',
              }}
            >
              <Eye size={12} />
              Visual
            </button>
            <button
              onClick={() => handleModeSwitch('html')}
              className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-r-md"
              style={{
                backgroundColor: editorMode === 'html' ? 'var(--accent-500)' : 'transparent',
                color: editorMode === 'html' ? '#fff' : 'var(--text-muted)',
              }}
            >
              <Code size={12} />
              HTML
            </button>
          </div>
        </div>

        {/* WYSIWYG Mode */}
        <div style={{ display: editorMode === 'wysiwyg' ? 'block' : 'none' }}>
          {/* WYSIWYG Toolbar */}
          <div
            className="flex flex-wrap items-center gap-1 p-2 rounded-t-lg border border-b-0"
            style={{
              backgroundColor: 'var(--bg-muted)',
              borderColor: 'var(--border-default)',
            }}
          >
            {/* Text Formatting */}
            <div className="flex items-center gap-0.5">
              <ToolbarButton
                onClick={() => editor.chain().focus().toggleBold().run()}
                active={editor.isActive('bold')}
                title="Bold"
              >
                <Bold size={16} />
              </ToolbarButton>
              <ToolbarButton
                onClick={() => editor.chain().focus().toggleItalic().run()}
                active={editor.isActive('italic')}
                title="Italic"
              >
                <Italic size={16} />
              </ToolbarButton>
              <ToolbarButton
                onClick={() => editor.chain().focus().toggleStrike().run()}
                active={editor.isActive('strike')}
                title="Strikethrough"
              >
                <Strikethrough size={16} />
              </ToolbarButton>
            </div>

            <ToolbarDivider />

            {/* Headings */}
            <div className="flex items-center gap-0.5">
              <ToolbarButton
                onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
                active={editor.isActive('heading', { level: 1 })}
                title="Heading 1"
              >
                <Heading1 size={16} />
              </ToolbarButton>
              <ToolbarButton
                onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
                active={editor.isActive('heading', { level: 2 })}
                title="Heading 2"
              >
                <Heading2 size={16} />
              </ToolbarButton>
              <ToolbarButton
                onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
                active={editor.isActive('heading', { level: 3 })}
                title="Heading 3"
              >
                <Heading3 size={16} />
              </ToolbarButton>
            </div>

            <ToolbarDivider />

            {/* Lists */}
            <div className="flex items-center gap-0.5">
              <ToolbarButton
                onClick={() => editor.chain().focus().toggleBulletList().run()}
                active={editor.isActive('bulletList')}
                title="Bullet List"
              >
                <List size={16} />
              </ToolbarButton>
              <ToolbarButton
                onClick={() => editor.chain().focus().toggleOrderedList().run()}
                active={editor.isActive('orderedList')}
                title="Numbered List"
              >
                <ListOrdered size={16} />
              </ToolbarButton>
              <ToolbarButton
                onClick={() => editor.chain().focus().toggleBlockquote().run()}
                active={editor.isActive('blockquote')}
                title="Quote"
              >
                <Quote size={16} />
              </ToolbarButton>
            </div>

            <ToolbarDivider />

            {/* Undo/Redo */}
            <div className="flex items-center gap-0.5">
              <ToolbarButton
                onClick={() => editor.chain().focus().undo().run()}
                disabled={!editor.can().undo()}
                title="Undo"
              >
                <Undo size={16} />
              </ToolbarButton>
              <ToolbarButton
                onClick={() => editor.chain().focus().redo().run()}
                disabled={!editor.can().redo()}
                title="Redo"
              >
                <Redo size={16} />
              </ToolbarButton>
            </div>

            <div className="flex-1" />

            {/* Insert Placeholder */}
            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setShowPlaceholderMenu(!showPlaceholderMenu)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium"
                style={{
                  background: showPlaceholderMenu ? 'var(--accent-100)' : 'var(--bg-surface)',
                  color: 'var(--accent-600)',
                  border: '1px solid var(--accent-200)',
                }}
              >
                <Variable size={14} />
                Insert Variable
                <ChevronDown
                  size={14}
                  style={{ transform: showPlaceholderMenu ? 'rotate(180deg)' : 'none' }}
                />
              </button>

              {showPlaceholderMenu && (
                <PlaceholderMenu
                  expandedCategory={expandedCategory}
                  setExpandedCategory={setExpandedCategory}
                  insertPlaceholder={insertPlaceholder}
                />
              )}
            </div>
          </div>

          {/* Editor Content */}
          <div
            className="rounded-b-lg border p-4 min-h-[200px]"
            style={{
              backgroundColor: 'var(--bg-surface)',
              borderColor: 'var(--border-default)',
            }}
          >
            <EditorContent editor={editor} className="tiptap-editor" />
          </div>
        </div>

        {/* HTML Mode - conditionally rendered because Monaco doesn't work with display:none */}
        {editorMode === 'html' && (
          <div>
            {/* HTML Mode Toolbar */}
            <div
              className="flex flex-wrap items-center gap-1 p-2 rounded-t-lg border border-b-0"
              style={{
                backgroundColor: 'var(--bg-muted)',
                borderColor: 'var(--border-default)',
              }}
            >
              <span
                className="text-xs font-medium px-2"
                style={{ color: 'var(--text-muted)' }}
              >
                Edit HTML directly • Use Eta syntax for logic
              </span>

              <div className="flex-1" />

              {/* Insert Placeholder in HTML mode */}
              <div className="relative" ref={menuRef}>
                <button
                  onClick={() => setShowPlaceholderMenu(!showPlaceholderMenu)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium"
                  style={{
                    background: showPlaceholderMenu ? 'var(--accent-100)' : 'var(--bg-surface)',
                    color: 'var(--accent-600)',
                    border: '1px solid var(--accent-200)',
                  }}
                >
                  <Variable size={14} />
                  Insert Variable
                  <ChevronDown
                    size={14}
                    style={{ transform: showPlaceholderMenu ? 'rotate(180deg)' : 'none' }}
                  />
                </button>

                {showPlaceholderMenu && (
                  <PlaceholderMenu
                    expandedCategory={expandedCategory}
                    setExpandedCategory={setExpandedCategory}
                    insertPlaceholder={insertPlaceholder}
                  />
                )}
              </div>
            </div>

            {/* Monaco Editor */}
            <div
              className="rounded-b-lg border overflow-hidden"
              style={{ borderColor: 'var(--border-default)' }}
            >
              <Editor
                height="300px"
                language="html"
                theme={resolvedTheme === 'dark' ? 'vs-dark' : 'light'}
                value={htmlContent}
                onChange={handleHtmlChange}
                options={{
                  minimap: { enabled: false },
                  fontSize: 13,
                  lineNumbers: 'on',
                  wordWrap: 'on',
                  scrollBeyondLastLine: false,
                  automaticLayout: true,
                  tabSize: 2,
                  padding: { top: 12, bottom: 12 },
                }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Styles for TipTap */}
      <style>{`
        .tiptap-editor .ProseMirror {
          outline: none;
          min-height: 150px;
        }
        .tiptap-editor .ProseMirror p {
          margin: 0.5em 0;
        }
        .tiptap-editor .ProseMirror h1 {
          font-size: 1.75em;
          font-weight: 700;
          margin: 0.75em 0 0.5em;
        }
        .tiptap-editor .ProseMirror h2 {
          font-size: 1.5em;
          font-weight: 600;
          margin: 0.75em 0 0.5em;
        }
        .tiptap-editor .ProseMirror h3 {
          font-size: 1.25em;
          font-weight: 600;
          margin: 0.75em 0 0.5em;
        }
        .tiptap-editor .ProseMirror ul,
        .tiptap-editor .ProseMirror ol {
          padding-left: 1.5em;
          margin: 0.5em 0;
        }
        .tiptap-editor .ProseMirror li {
          margin: 0.25em 0;
        }
        .tiptap-editor .ProseMirror blockquote {
          border-left: 3px solid var(--accent-300);
          padding-left: 1em;
          margin: 0.5em 0;
          color: var(--text-muted);
          font-style: italic;
        }
        .tiptap-editor .ProseMirror p.is-editor-empty:first-child::before {
          color: var(--text-subtle);
          content: attr(data-placeholder);
          float: left;
          height: 0;
          pointer-events: none;
        }
      `}</style>
    </div>
  );
}

// Placeholder Menu Component
function PlaceholderMenu({
  expandedCategory,
  setExpandedCategory,
  insertPlaceholder,
}: {
  expandedCategory: string | null;
  setExpandedCategory: (cat: string | null) => void;
  insertPlaceholder: (key: string, label: string) => void;
}) {
  return (
    <div
      className="absolute right-0 top-full mt-1 w-72 rounded-lg shadow-xl z-50 overflow-hidden"
      style={{
        backgroundColor: 'var(--bg-surface)',
        border: '1px solid var(--border-default)',
      }}
    >
      {Object.entries(PLACEHOLDER_CATEGORIES).map(([catKey, category]) => (
        <div key={catKey}>
          <button
            onClick={() =>
              setExpandedCategory(expandedCategory === catKey ? null : catKey)
            }
            className="w-full flex items-center justify-between px-3 py-2 text-sm font-semibold transition-colors"
            style={{
              backgroundColor:
                expandedCategory === catKey
                  ? 'var(--bg-muted)'
                  : 'transparent',
              color: 'var(--text-primary)',
            }}
          >
            {category.label}
            <ChevronDown
              size={14}
              className={`transition-transform ${
                expandedCategory === catKey ? 'rotate-180' : ''
              }`}
              style={{ color: 'var(--text-muted)' }}
            />
          </button>
          {expandedCategory === catKey && (
            <div
              className="py-1"
              style={{ backgroundColor: 'var(--bg-base)' }}
            >
              {category.placeholders.map((p) => (
                <button
                  key={p.key}
                  onClick={() => insertPlaceholder(p.key, p.label)}
                  className="w-full text-left px-4 py-1.5 text-sm hover:bg-[var(--bg-muted)] transition-colors flex items-center justify-between"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  <span>{p.label}</span>
                  <code
                    className="text-xs px-1.5 py-0.5 rounded"
                    style={{
                      backgroundColor: 'var(--bg-muted)',
                      color: 'var(--text-muted)',
                    }}
                  >
                    {p.key}
                  </code>
                </button>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// Toolbar Button Component
function ToolbarButton({
  onClick,
  active,
  disabled,
  title,
  children,
}: {
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="p-1.5 rounded transition-colors"
      style={{
        backgroundColor: active ? 'var(--accent-100)' : 'transparent',
        color: active
          ? 'var(--accent-600)'
          : disabled
          ? 'var(--text-subtle)'
          : 'var(--text-secondary)',
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}
    >
      {children}
    </button>
  );
}

function ToolbarDivider() {
  return (
    <div
      className="w-px h-5 mx-1"
      style={{ backgroundColor: 'var(--border-default)' }}
    />
  );
}
