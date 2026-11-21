import type { Node as PMNode } from "@tiptap/pm/model";

export interface TextMatch {
  from: number;
  to: number;
}

/**
 * Every occurrence of `query` in the document's text, as document positions.
 *
 * Text is searched block by block, so a match never spans two paragraphs. It
 * may span formatting (a word half in bold), but not an inline image, because
 * positions are only mapped through text.
 */
export function findMatches(doc: PMNode, query: string, caseSensitive: boolean): TextMatch[] {
  if (!query) return [];
  const needle = caseSensitive ? query : query.toLocaleLowerCase();
  const matches: TextMatch[] = [];
  doc.descendants((block, blockPos) => {
    if (!block.isTextblock) return true;
    // Map each character of the block's text back to its document position.
    let text = "";
    const positions: number[] = [];
    block.forEach((child, offset) => {
      if (!child.isText || !child.text) {
        text += "\u0000"; // an inline image or break interrupts a match
        positions.push(-1);
        return;
      }
      for (let i = 0; i < child.text.length; i++) {
        text += child.text[i];
        positions.push(blockPos + 1 + offset + i);
      }
    });
    const haystack = caseSensitive ? text : text.toLocaleLowerCase();
    let at = haystack.indexOf(needle);
    while (at !== -1) {
      const start = positions[at];
      const last = positions[at + needle.length - 1];
      if (start >= 0 && last >= 0 && !haystack.slice(at, at + needle.length).includes("\u0000")) {
        matches.push({ from: start, to: last + 1 });
      }
      at = haystack.indexOf(needle, at + Math.max(needle.length, 1));
    }
    return false;
  });
  return matches;
}
