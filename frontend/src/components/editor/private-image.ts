import { Node } from '@tiptap/core';
import { imageUrl } from '@/components/assets/asset-library';

/** Persist asset identity and per-occurrence accessible text, never a remote URL. */
export const PrivateImage = Node.create({
  name: 'image', group: 'block', atom: true, draggable: true,
  addAttributes() { return { assetId: { default: '' }, alt: { default: '' }, caption: { default: '' } }; },
  // Image paste/import is intentionally not accepted; use the owner-checked library.
  parseHTML() { return []; },
  renderHTML({ node }) {
    return ['figure', { class: 'my-4' },
      ['img', { src: imageUrl(String(node.attrs.assetId)), alt: node.attrs.alt, class: 'max-w-full h-auto mx-auto', loading: 'lazy' }],
      ['figcaption', { class: 'text-sm text-center text-muted-foreground' }, String(node.attrs.caption)]];
  },
});
