/** Supported editor document grammar, bounded before recursive rendering. */
export function documentError(input: unknown): string | null {
  let count = 0;
  let imageCount = 0;
  const block = new Set(['paragraph', 'heading', 'blockquote', 'bulletList', 'orderedList', 'codeBlock', 'horizontalRule', 'table', 'image']);
  const inline = new Set(['text', 'hardBreak']);
  const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
  const fail = (message: string): never => { throw new Error(message); };
  const walk = (value: unknown, depth: number, parent?: string) => {
    if (++count > 50000 || depth > 32) fail('Document is too complex');
    if (!object(value) || typeof value.type !== 'string') fail('Invalid document node');
    const node = value as Record<string, unknown>;
    const type = node.type as string;
    if (type === 'image' && ++imageCount > 100) fail('A chapter can contain at most 100 images');
    if (Object.keys(node).some(k => !['type', 'attrs', 'content', 'marks', 'text'].includes(k))) fail('Unsupported node property');
    let allowedChild = false;
    if (!parent) allowedChild = type === 'doc';
    else if (['doc', 'blockquote', 'listItem', 'tableCell', 'tableHeader'].includes(parent)) allowedChild = block.has(type);
    else if (['paragraph', 'heading'].includes(parent)) allowedChild = inline.has(type);
    else if (parent === 'codeBlock') allowedChild = type === 'text';
    else if (['bulletList', 'orderedList'].includes(parent)) allowedChild = type === 'listItem';
    else if (parent === 'table') allowedChild = type === 'tableRow';
    else if (parent === 'tableRow') allowedChild = ['tableCell', 'tableHeader'].includes(type);
    if (!allowedChild) fail('Unsupported document structure');
    const children = node.content === undefined ? [] : node.content;
    if (!Array.isArray(children)) fail('Node content must be an array');
    if (type === 'text') {
      if (typeof node.text !== 'string' || !node.text.length || node.text.length > 1000000 || node.content !== undefined) fail('Invalid text node');
    } else if (node.text !== undefined) fail('Text is only allowed in text nodes');
    if (['hardBreak', 'horizontalRule', 'image'].includes(type) && (children as unknown[]).length) fail('Leaf node has children');
    if (['bulletList', 'orderedList', 'listItem', 'blockquote', 'table', 'tableRow', 'tableCell', 'tableHeader'].includes(type) && !(children as unknown[]).length) fail('Container cannot be empty');
    if (type === 'listItem' && (children as { type: string }[])[0]?.type !== 'paragraph') fail('List items must start with a paragraph');
    const attrs = node.attrs ?? {};
    if (!object(attrs)) fail('Invalid attributes');
    const a = attrs as Record<string, unknown>;
    const allowed: Record<string, string[]> = { image: ['assetId', 'alt', 'caption'], heading: ['level'], orderedList: ['start', 'type'], codeBlock: ['language'], table: [], tableCell: ['colspan', 'rowspan', 'colwidth'], tableHeader: ['colspan', 'rowspan', 'colwidth'] };
    if (Object.keys(a).some(k => !(allowed[type] ?? []).includes(k))) fail('Unsupported node attribute');
    if (type === 'image' && (typeof a.assetId !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(a.assetId) || typeof a.alt !== 'string' || a.alt.length > 500 || typeof a.caption !== 'string' || a.caption.length > 1000)) fail('Invalid image attributes');
    if (type === 'heading' && ![2, 3, 4].includes(a.level as number)) fail('Heading level must be 2, 3 or 4');
    if (a.start !== undefined && (!Number.isSafeInteger(a.start) || (a.start as number) < 1)) fail('Invalid list start');
    if (a.type != null && !['1', 'a', 'A', 'i', 'I'].includes(a.type as string)) fail('Invalid list type');
    if (a.language != null && (typeof a.language !== 'string' || a.language.length > 100)) fail('Invalid code language');
    for (const k of ['colspan', 'rowspan']) if (a[k] !== undefined && (!Number.isInteger(a[k]) || (a[k] as number) < 1 || (a[k] as number) > 100)) fail('Invalid table span');
    if (a.colwidth != null && (!Array.isArray(a.colwidth) || a.colwidth.length !== (a.colspan ?? 1) || a.colwidth.some(w => !Number.isInteger(w) || w < 0 || w > 10000))) fail('Invalid table widths');
    if (node.marks !== undefined) {
      if (!inline.has(type) || parent === 'codeBlock' || !Array.isArray(node.marks) || node.marks.length > 8) fail('Invalid marks');
      const seen = new Set<string>();
      for (const mark of node.marks as unknown[]) {
        if (!object(mark) || typeof mark.type !== 'string' || !['bold', 'italic', 'strike', 'code', 'underline', 'link'].includes(mark.type)) fail('Unsupported mark');
        const m = mark as Record<string, unknown>;
        if (Object.keys(m).some(k => !['type', 'attrs'].includes(k)) || seen.has(m.type as string)) fail('Invalid mark');
        seen.add(m.type as string);
        const ma = m.attrs ?? {};
        if (!object(ma)) fail('Invalid mark attributes');
        const attr = ma as Record<string, unknown>;
        if (Object.keys(attr).some(k => !(m.type === 'link' ? ['href', 'target', 'rel', 'class', 'title'] : []).includes(k))) fail('Unsupported mark attribute');
        if (Object.values(attr).some(v => v != null && (typeof v !== 'string' || v.length > 2048))) fail('Invalid link attribute');
        if (m.type === 'link' && (typeof attr.href !== 'string' || !/^(https?:\/\/|mailto:|tel:|#)/i.test(attr.href) || /[\u0000-\u0020]/.test(attr.href))) fail('Unsupported link URL');
      }
    }
    for (const child of children as unknown[]) walk(child, depth + 1, type);
  };
  try { walk(input, 0); return null; } catch (error) { return error instanceof Error ? error.message : 'Invalid document'; }
}

/** Call on validated documents; iterative traversal also tolerates empty snapshots. */
export function imageAssetIds(document: unknown): string[] {
  const ids = new Set<string>();
  const pending: unknown[] = [document];
  let visited = 0;
  while (pending.length && visited++ < 50000) {
    const node = pending.pop();
    if (!node || typeof node !== 'object') continue;
    const n = node as { type?: string; attrs?: { assetId?: unknown }; content?: unknown[] };
    if (n.type === 'image' && typeof n.attrs?.assetId === 'string') ids.add(n.attrs.assetId);
    if (Array.isArray(n.content)) pending.push(...n.content);
  }
  return [...ids];
}
