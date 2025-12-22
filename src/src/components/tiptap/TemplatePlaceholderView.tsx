import { NodeViewWrapper } from '@tiptap/react';

export function TemplatePlaceholderView({ node }: { node: any }) {
  const { key, label } = node.attrs;

  return (
    <NodeViewWrapper
      as="span"
      className="template-placeholder"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        background: 'var(--accent-100)',
        color: 'var(--accent-700)',
        padding: '2px 8px',
        borderRadius: '4px',
        fontSize: '0.875em',
        fontFamily: 'var(--font-mono, monospace)',
        fontWeight: 500,
        cursor: 'default',
        userSelect: 'none',
        border: '1px solid var(--accent-200)',
      }}
      contentEditable={false}
      data-key={key}
    >
      <span style={{ opacity: 0.6 }}>{'{'}</span>
      {label || key}
      <span style={{ opacity: 0.6 }}>{'}'}</span>
    </NodeViewWrapper>
  );
}

