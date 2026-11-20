import type { PMMark, PMNode } from "../editor/markdownToTiptap.js";

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
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
      return wrapMarks(escapeHtml(node.text ?? ""), node.marks);
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
    case "table":
      return `<table>${children()}</table>`;
    case "tableRow":
      return `<tr>${children()}</tr>`;
    case "tableHeader":
      return `<th>${children()}</th>`;
    case "tableCell":
      return `<td>${children()}</td>`;
    case "image": {
      const src = images[String(node.attrs?.assetId ?? "")];
      if (!src || !/^data:image\/webp;base64,[A-Za-z0-9+/=]+$/.test(src)) throw new Error("Image is not available for export");
      const alt = escapeHtml(String(node.attrs?.alt ?? ""));
      return `<figure><img src="${escapeHtml(src)}" alt="${alt}" />${node.attrs?.caption ? `<figcaption>${escapeHtml(String(node.attrs.caption))}</figcaption>` : ""}</figure>`;
    }
    case "pageBreak":
      return `<div class="page-break"></div>`;
    default:
      return children();
  }
}
