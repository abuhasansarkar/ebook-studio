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

function renderBlockquote(node: PMNode, images: Record<string, string>): string {
  if (!node.content || !node.content.length) return "<blockquote></blockquote>";
  const firstChild = node.content[0];
  if (firstChild.type === "paragraph" && firstChild.content && firstChild.content.length) {
    const firstTextNode = firstChild.content[0];
    if (firstTextNode.type === "text" && typeof firstTextNode.text === "string") {
      const match = firstTextNode.text.match(/^\[!(EXAMPLE|CONCRETE_EXAMPLE|MISTAKE|ERROR|WARNING|SUMMARY|TAKEAWAY|TIP|NOTE|QUOTE|HERO_QUOTE|CTA|CARD)\](?:[ \t]*(.*))?(?:\r?\n|$)/i);
      if (match) {
        const alertType = match[1].toUpperCase();
        const customTitle = match[2]?.trim();
        const remainingText = firstTextNode.text.slice(match[0].length).replace(/^[\s:]+/, "");
        const newFirstParaContent: PMNode[] = [];
        if (remainingText) {
          newFirstParaContent.push({ ...firstTextNode, text: remainingText });
        }
        newFirstParaContent.push(...firstChild.content.slice(1));
        
        const newContent: PMNode[] = [];
        if (newFirstParaContent.length) {
          newContent.push({ ...firstChild, content: newFirstParaContent });
        }
        newContent.push(...node.content.slice(1));
        
        const innerHtml = newContent.map(c => tiptapToHtml(c, images)).join("");
        
        if (alertType === "EXAMPLE" || alertType === "CONCRETE_EXAMPLE") {
          const title = customTitle || "Exemple concret";
          return `<div class="card-example"><h3 class="card-title">${escapeHtml(title)}</h3>${innerHtml}</div>`;
        }
        if (alertType === "MISTAKE" || alertType === "ERROR" || alertType === "WARNING") {
          return `<div class="card-mistake"><span class="badge-mistake" aria-hidden="true">✕</span>${customTitle ? `<h4 class="mistake-title">${escapeHtml(customTitle)}</h4>` : ""}${innerHtml}</div>`;
        }
        if (alertType === "SUMMARY" || alertType === "TAKEAWAY") {
          const title = customTitle || "👉 En résumé";
          return `<div class="summary-banner"><h3 class="summary-title">${escapeHtml(title)}</h3>${innerHtml}</div>`;
        }
        if (alertType === "QUOTE" || alertType === "HERO_QUOTE") {
          return `<div class="quote-hero"><span class="quote-glyph" aria-hidden="true">“</span><blockquote>${innerHtml}</blockquote></div>`;
        }
        if (alertType === "TIP" || alertType === "NOTE") {
          return `<div class="card-tip"><span class="tip-glyph">💡</span>${customTitle ? `<strong>${escapeHtml(customTitle)}</strong> ` : ""}${innerHtml}</div>`;
        }
        if (alertType === "CTA") {
          return `<div class="cta-block">${customTitle ? `<h3>${escapeHtml(customTitle)}</h3>` : ""}${innerHtml}</div>`;
        }
        if (alertType === "CARD") {
          return `<div class="editorial-card">${customTitle ? `<h4 class="card-title">${escapeHtml(customTitle)}</h4>` : ""}${innerHtml}</div>`;
        }
      }
    }
  }
  return `<blockquote>${(node.content ?? []).map(child => tiptapToHtml(child, images)).join("")}</blockquote>`;
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
      return renderBlockquote(node, images);
    case "callout": {
      const variant = typeof node.attrs?.variant === "string" ? node.attrs.variant : "example";
      return `<div class="card-${escapeHtml(variant)}">${children()}</div>`;
    }
    case "card": {
      const variant = typeof node.attrs?.variant === "string" ? node.attrs.variant : "default";
      const title = typeof node.attrs?.title === "string" ? `<h4 class="card-title">${escapeHtml(node.attrs.title)}</h4>` : "";
      return `<div class="editorial-card card-${escapeHtml(variant)}">${title}${children()}</div>`;
    }
    case "grid": {
      const cols = Number(node.attrs?.columns) || 2;
      return `<div class="editorial-grid grid-${cols}">${children()}</div>`;
    }
    case "columns":
      return `<div class="split-columns">${children()}</div>`;
    case "column":
      return `<div class="column">${children()}</div>`;
    case "cta": {
      const btnText = typeof node.attrs?.buttonText === "string" ? escapeHtml(node.attrs.buttonText) : "";
      const btnHref = safeHref(node.attrs?.buttonUrl);
      const btn = btnText ? `<div class="cta-button-wrap"><a href="${escapeHtml(btnHref || '#')}" class="cta-button">${btnText}</a></div>` : "";
      return `<div class="cta-block">${children()}${btn}</div>`;
    }
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
