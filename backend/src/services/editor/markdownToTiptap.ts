import { marked, type Token, type Tokens } from "marked";

/** Minimal TipTap/ProseMirror JSON types. */
export interface PMMark {
  type: string;
  attrs?: Record<string, unknown>;
}
export interface PMNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: PMNode[];
  marks?: PMMark[];
  text?: string;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function inline(tokens: Token[] | undefined, marks: PMMark[] = []): PMNode[] {
  if (!tokens) return [];
  const out: PMNode[] = [];
  const push = (text: string, m: PMMark[]) => {
    if (!text) return;
    out.push(m.length ? { type: "text", text, marks: m } : { type: "text", text });
  };
  for (const t of tokens) {
    switch (t.type) {
      case "strong":
        out.push(...inline((t as Tokens.Strong).tokens, [...marks, { type: "bold" }]));
        break;
      case "em":
        out.push(...inline((t as Tokens.Em).tokens, [...marks, { type: "italic" }]));
        break;
      case "del":
        out.push(...inline((t as Tokens.Del).tokens, [...marks, { type: "strike" }]));
        break;
      case "codespan":
        push(decodeEntities((t as Tokens.Codespan).text), [...marks, { type: "code" }]);
        break;
      case "link": {
        const l = t as Tokens.Link;
        out.push(...inline(l.tokens, [...marks, { type: "link", attrs: { href: l.href } }]));
        break;
      }
      case "br":
        out.push({ type: "hardBreak" });
        break;
      case "text": {
        const tt = t as Tokens.Text;
        if (tt.tokens?.length) out.push(...inline(tt.tokens, marks));
        else push(decodeEntities(tt.text), marks);
        break;
      }
      case "escape":
        push((t as Tokens.Escape).text, marks);
        break;
      default:
        if ("text" in t && typeof t.text === "string") push(decodeEntities(t.text), marks);
    }
  }
  return out;
}

function paragraph(content: PMNode[]): PMNode {
  return content.length ? { type: "paragraph", content } : { type: "paragraph" };
}

function blocks(tokens: Token[]): PMNode[] {
  const out: PMNode[] = [];
  for (const t of tokens) {
    switch (t.type) {
      case "heading": {
        const h = t as Tokens.Heading;
        // H1 is reserved for the chapter title.
        const level = Math.min(4, Math.max(2, h.depth));
        out.push({ type: "heading", attrs: { level }, content: inline(h.tokens) });
        break;
      }
      case "paragraph":
        out.push(paragraph(inline((t as Tokens.Paragraph).tokens)));
        break;
      case "text": {
        const tt = t as Tokens.Text;
        out.push(paragraph(tt.tokens ? inline(tt.tokens) : inline([tt])));
        break;
      }
      case "list": {
        const l = t as Tokens.List;
        out.push({
          type: l.ordered ? "orderedList" : "bulletList",
          ...(l.ordered ? { attrs: { start: typeof l.start === "number" ? l.start : 1 } } : {}),
          content: l.items.map((item) => {
            const content = blocks(item.tokens);
            return { type: "listItem", content: content.length ? content : [paragraph([])] };
          }),
        });
        break;
      }
      case "blockquote": {
        const content = blocks((t as Tokens.Blockquote).tokens);
        out.push({ type: "blockquote", content: content.length ? content : [paragraph([])] });
        break;
      }
      case "code": {
        const c = t as Tokens.Code;
        out.push({ type: "codeBlock", attrs: { language: c.lang || null }, content: c.text ? [{ type: "text", text: c.text }] : [] });
        break;
      }
      case "hr":
        out.push({ type: "horizontalRule" });
        break;
      case "table": {
        const tb = t as Tokens.Table;
        const cell = (type: string, c: Tokens.TableCell): PMNode => ({ type, content: [paragraph(inline(c.tokens))] });
        out.push({
          type: "table",
          content: [
            { type: "tableRow", content: tb.header.map((h) => cell("tableHeader", h)) },
            ...tb.rows.map((r) => ({ type: "tableRow", content: r.map((c) => cell("tableCell", c)) })),
          ],
        });
        break;
      }
      case "space":
      case "html":
      case "def":
        break;
      default:
        if ("text" in t && typeof t.text === "string" && t.text.trim()) out.push(paragraph([{ type: "text", text: t.text }]));
    }
  }
  return out;
}

export function markdownToTiptap(markdown: string): PMNode {
  const tokens = marked.lexer(markdown, { gfm: true });
  const content = blocks(tokens);
  return { type: "doc", content: content.length ? content : [paragraph([])] };
}

/** Plain text of a TipTap document (for word counts, summaries, search). */
export function tiptapToText(node: PMNode | null | undefined): string {
  if (!node) return "";
  if (node.type === "text") return node.text ?? "";
  if (node.type === "hardBreak") return "\n";
  const inner = (node.content ?? []).map(tiptapToText).join(node.type === "doc" || node.type.endsWith("List") ? "\n" : "");
  return ["paragraph", "heading", "listItem", "blockquote", "codeBlock", "tableRow"].includes(node.type) ? `${inner}\n` : inner;
}

/**
 * Word count that also works for scripts without spaces (CJK):
 * each CJK character counts as one word.
 */
export function countWords(text: string): number {
  const cjk = text.match(/[぀-ヿ㐀-䶿一-鿿가-힯]/g)?.length ?? 0;
  const rest = text.replace(/[぀-ヿ㐀-䶿一-鿿가-힯]/g, " ");
  const words = rest.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
  return words + cjk;
}
