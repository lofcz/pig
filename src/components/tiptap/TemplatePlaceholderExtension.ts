import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { TemplatePlaceholderView } from './TemplatePlaceholderView';

export interface TemplatePlaceholderOptions {
  HTMLAttributes: Record<string, any>;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    templatePlaceholder: {
      insertPlaceholder: (key: string, label: string) => ReturnType;
    };
  }
}

export const TemplatePlaceholder = Node.create<TemplatePlaceholderOptions>({
  name: 'templatePlaceholder',

  group: 'inline',

  inline: true,

  atom: true,

  addOptions() {
    return {
      HTMLAttributes: {},
    };
  },

  addAttributes() {
    return {
      key: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-key'),
        renderHTML: (attributes) => ({
          'data-key': attributes.key,
        }),
      },
      label: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-label'),
        renderHTML: (attributes) => ({
          'data-label': attributes.label,
        }),
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-template-placeholder]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(
        this.options.HTMLAttributes,
        HTMLAttributes,
        { 'data-template-placeholder': '' }
      ),
      `{{${HTMLAttributes['data-key']}}}`,
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(TemplatePlaceholderView);
  },

  addCommands() {
    return {
      insertPlaceholder:
        (key: string, label: string) =>
        ({ commands }) => {
          return commands.insertContent({
            type: this.name,
            attrs: { key, label },
          });
        },
    };
  },
});

