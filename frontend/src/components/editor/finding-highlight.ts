import { Extension } from '@tiptap/core';
import type { Node as PMNode } from '@tiptap/pm/model';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

/** Visible highlight for a quality finding. It follows edits (mapped through transactions) and is never saved. */
export const findingHighlightKey = new PluginKey<DecorationSet>('findingHighlight');
export const FindingHighlight = Extension.create({
  name: 'findingHighlight',
  addProseMirrorPlugins() {
    return [new Plugin<DecorationSet>({
      key: findingHighlightKey,
      state: {
        init: () => DecorationSet.empty,
        apply(tr, set) {
          const meta = tr.getMeta(findingHighlightKey) as { from: number; to: number } | null | undefined;
          if (meta === null) return DecorationSet.empty;
          if (meta) return DecorationSet.create(tr.doc, [Decoration.inline(meta.from, meta.to, { class: 'finding-highlight', 'data-finding-highlight': 'true' })]);
          return set.map(tr.mapping, tr.doc);
        },
      },
      props: { decorations: state => findingHighlightKey.getState(state) },
    })];
  },
});

/**
 * Editor positions for (text block index, character offsets). Blocks are counted in the same order as the
 * shared `textBlocks()` (paragraphs, headings and code blocks, depth-first); offsets count text characters only.
 */
export function rangeForBlock(doc: PMNode, block: number, start: number, end: number): { from: number; to: number } | null {
  let index = -1;
  let result: { from: number; to: number } | null = null;
  doc.descendants((node, pos) => {
    if (result) return false;
    if (!node.isTextblock) return true;
    if (++index !== block) return false;
    let text = 0, from = -1, to = -1;
    node.forEach((child, offset) => {
      const at = pos + 1 + offset;
      if (child.isText) {
        const len = child.text!.length;
        if (from < 0 && start >= text && start <= text + len) from = at + (start - text);
        if (to < 0 && end >= text && end <= text + len) to = at + (end - text);
        text += len;
      }
    });
    if (from >= 0 && to >= from) result = { from, to };
    return false;
  });
  return result;
}
