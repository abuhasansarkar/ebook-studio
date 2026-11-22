import type { PMMark, PMNode } from "../editor/markdownToTiptap.js";

/**
 * Characters XML 1.0 forbids: C0 controls other than tab, newline and carriage
 * return, the non-characters U+FFFE/U+FFFF and unpaired surrogates. One of them
 * makes an EPUB/XHTML file unparseable, and they never carry visible text.
 */
const XML_ILLEGAL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]|[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/g;

export function stripXmlIllegal(s: string): string {
  return s.replace(XML_ILLEGAL, "");
}

export function escapeHtml(s: string): string {
  return stripXmlIllegal(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function safeHref(href: unknown): string | null {
  if (typeof href !== "string") return null;
  return /^(https?:|mailto:|#)/i.test(href.trim()) ? href.trim() : null;
}

function wrapMarks(html: string, marks: PMMark[] | undefined): string {
  if (!marks) return html;
  return marks.reduce((acc, m) => {
    switch (m.type) {
      case "bold":
        return `<strong>${acc}</strong>`;
      case "italic":
        return `<em>${acc}</em>`;
      case "underline":
        return `<u>${acc}</u>`;
      case "strike":
        return `<s>${acc}</s>`;
      case "code":
        return `<code>${acc}</code>`;
      case "link": {
        const href = safeHref(m.attrs?.href);
        return href ? `<a href="${escapeHtml(href)}">${acc}</a>` : acc;
      }
      default:
        return acc;
    }
  }, html);
}

/** Renders TipTap JSON to safe HTML (all text escaped, only whitelisted nodes). */
export function tiptapToHtml(node: PMNode | null | undefined, images: Record<string, string> = {}): string {
  if (!node) return "";
  const children = () => (node.content ?? []).map(child => tiptapToHtml(child, images)).join("");
  const align = typeof node.attrs?.textAlign === "string" && /^(left|right|center|justify)$/.test(node.attrs.textAlign) ? ` style="text-align:${node.attrs.textAlign}"` : "";
  switch (node.type) {
    case "doc":
      return children();
    case "text":
      // NFC keeps composed and decomposed input (e.g. Bengali nukta forms) shaping and searching identically.
      return wrapMarks(escapeHtml((node.text ?? "").normalize("NFC")), node.marks);
    case "paragraph":
      return `<p${align}>${children()}</p>`;
    case "heading": {
      const level = Math.min(6, Math.max(2, Number(node.attrs?.level) || 2));
      return `<h${level}${align}>${children()}</h${level}>`;
    }
    case "bulletList":
      return `<ul>${children()}</ul>`;
    case "orderedList": {
      const start = Number(node.attrs?.start) || 1;
      return `<ol${start !== 1 ? ` start="${start}"` : ""}>${children()}</ol>`;
    }
    case "listItem":
      return `<li>${children()}</li>`;
    case "blockquote":
      return `<blockquote>${children()}</blockquote>`;
    case "codeBlock":
      return `<pre><code>${children()}</code></pre>`;
    case "horizontalRule":
      return `<hr />`;
    case "hardBreak":
      return `<br />`;
    case "table": {
      // A leading all-header row becomes <thead>, which repeats on every printed page of a long table.
      const rows = node.content ?? [];
      const headed = rows.length > 1 && (rows[0].content ?? []).every((cell) => cell.type === "tableHeader");
      const render = (list: PMNode[]) => list.map((row) => tiptapToHtml(row, images)).join("");
      const body = headed ? `<thead>${render(rows.slice(0, 1))}</thead><tbody>${render(rows.slice(1))}</tbody>` : `<tbody>${render(rows)}</tbody>`;
      return `<div class="table-wrap"><table>${body}</table></div>`;
    }
    case "tableRow":
      return `<tr>${children()}</tr>`;
    case "tableHeader":
    case "tableCell": {
      const tag = node.type === "tableHeader" ? "th" : "td";
      const span = (["colspan", "rowspan"] as const).map((k) => { const v = Number(node.attrs?.[k]); return Number.isInteger(v) && v > 1 && v <= 100 ? ` ${k}="${v}"` : ""; }).join("");
      return `<${tag}${span}>${children()}</${tag}>`;
    }
    case "image": {
      const src = images[String(node.attrs?.assetId ?? "")];
      // Exports embed verified bytes; browser previews reference the owner-authenticated asset route.
      if (!src || !(/^data:image\/webp;base64,[A-Za-z0-9+/=]+$/.test(src) || /^\/api\/v1\/assets\/[A-Za-z0-9_-]{1,100}\/content$/.test(src))) throw new Error("Image is not available for export");
      const alt = escapeHtml(String(node.attrs?.alt ?? ""));
      return `<figure><img src="${escapeHtml(src)}" alt="${alt}" />${node.attrs?.caption ? `<figcaption>${escapeHtml(String(node.attrs.caption).normalize("NFC"))}</figcaption>` : ""}</figure>`;
    }
    case "pageBreak":
      return `<div class="page-break"></div>`;
    default:
      return children();
  }
}
