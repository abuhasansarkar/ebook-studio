import type { EpubExportOptions } from '@ebook/shared';
import type { PMNode } from '../editor/markdownToTiptap.js';
import { escapeHtml } from './tiptapToHtml.js';
import { buildZip } from './zip.js';
import { documentLanguage, type PinnedImage, type RenderInput } from './renderTypes.js';

/**
 * EPUB 3 renderer.
 *
 * Produces a reflowable EPUB 3 package: `mimetype`, `META-INF/container.xml`,
 * the OPF package document with metadata and a spine, the EPUB 3 navigation
 * document, one XHTML content document per chapter and a stylesheet.
 *
 * Every text node is escaped, every image reference is a pinned internal
 * resource, and the manifest lists exactly the files that are written.
 */

export interface EpubSection {
  /** XHTML file name inside the package, e.g. `chapter-1.xhtml`. */
  file: string;
  /** Identifier used by the spine and the navigation document. */
  id: string;
  title: string;
  /** XHTML body content. */
  body: string;
  /** True for front or back matter rather than a manuscript chapter. */
  matter: boolean;
}

export interface EpubRenderResult {
  buffer: Buffer;
  facts: Record<string, string | number | boolean>;
}

/** XML text escaping, including the characters that are invalid in XML 1.0. */
function xmlText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
    // Control characters are not permitted in XML 1.0 and make the file unparseable.
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
}

function xmlAttr(value: string): string { return xmlText(value); }

/** Plain-text matter paragraphs: blank lines separate paragraphs, single newlines are breaks. */
function matterParagraphs(value: string): string {
  return value.trim().split(/\n\s*\n/).filter((p) => p.trim())
    .map((p) => `<p>${p.split("\n").map((line) => escapeHtml(line.normalize('NFC'))).join('<br/>')}</p>`)
    .join('');
}

interface InlineContext {
  /** Resolves an asset id to the file name of a pinned image, or null when it is missing. */
  image: (assetId: string) => string | null;
  /** Records an image that could not be resolved. */
  missing: (assetId: string) => void;
  /** Collects the ids of images actually referenced. */
  used: Set<string>;
}

/** Renders TipTap JSON to XHTML. Only whitelisted nodes are emitted; all text is escaped. */
function renderBlocks(node: PMNode | null | undefined, ctx: InlineContext): string {
  if (!node) return '';
  const children = () => (node.content ?? []).map((child) => renderBlocks(child, ctx)).join('');
  const align = typeof node.attrs?.textAlign === 'string' && /^(left|right|center|justify)$/.test(node.attrs.textAlign) ? ` style="text-align:${node.attrs.textAlign}"` : '';
  switch (node.type) {
    case 'doc': return children();
    case 'text': return renderInline(node, ctx);
    case 'paragraph': return `<p${align}>${children()}</p>`;
    case 'heading': {
      const level = Math.min(4, Math.max(2, Number(node.attrs?.level) || 2));
      return `<h${level}${align}>${children()}</h${level}>`;
    }
    case 'bulletList': return `<ul>${children()}</ul>`;
    case 'orderedList': {
      const start = Number(node.attrs?.start) || 1;
      return `<ol${start !== 1 ? ` start="${start}"` : ''}>${children()}</ol>`;
    }
    case 'listItem': return `<li>${children()}</li>`;
    case 'blockquote': return `<blockquote>${children()}</blockquote>`;
    case 'codeBlock': return `<pre><code>${children()}</code></pre>`;
    case 'horizontalRule': return '<hr/>';
    case 'hardBreak': return '<br/>';
    case 'table': {
      const rows = node.content ?? [];
      const headed = rows.length > 1 && (rows[0].content ?? []).every((cell) => cell.type === 'tableHeader');
      const render = (list: PMNode[]) => list.map((row) => renderBlocks(row, ctx)).join('');
      const body = headed
        ? `<thead>${render(rows.slice(0, 1))}</thead><tbody>${render(rows.slice(1))}</tbody>`
        : `<tbody>${render(rows)}</tbody>`;
      return `<table>${body}</table>`;
    }
    case 'tableRow': return `<tr>${children()}</tr>`;
    case 'tableHeader':
    case 'tableCell': {
      const tag = node.type === 'tableHeader' ? 'th' : 'td';
      const span = (['colspan', 'rowspan'] as const).map((k) => {
        const v = Number(node.attrs?.[k]);
        return Number.isInteger(v) && v > 1 && v <= 100 ? ` ${k}="${v}"` : '';
      }).join('');
      return `<${tag}${span}>${children()}</${tag}>`;
    }
    case 'image': {
      const assetId = String(node.attrs?.assetId ?? '');
      const file = ctx.image(assetId);
      if (!file) {
        ctx.missing(assetId);
        // The alt text is kept so the information is not lost when an image is unavailable.
        return `<p class="missing-image">${escapeHtml(String(node.attrs?.alt ?? '').normalize('NFC'))}</p>`;
      }
      ctx.used.add(assetId);
      const alt = escapeHtml(String(node.attrs?.alt ?? '').normalize('NFC'));
      const caption = node.attrs?.caption ? `<figcaption>${escapeHtml(String(node.attrs.caption).normalize('NFC'))}</figcaption>` : '';
      return `<figure><img src="${xmlAttr(file)}" alt="${xmlAttr(alt)}"/>${caption}</figure>`;
    }
    case 'pageBreak': return '<p class="page-break"/>';
    default: return children();
  }
}

/** Renders a text node with its marks applied. */
function renderInline(node: PMNode, ctx: InlineContext): string {
  let html = escapeHtml((node.text ?? '').normalize('NFC'));
  for (const mark of node.marks ?? []) {
    switch (mark.type) {
      case 'bold': html = `<strong>${html}</strong>`; break;
      case 'italic': html = `<em>${html}</em>`; break;
      case 'underline': html = `<u>${html}</u>`; break;
      case 'strike': html = `<s>${html}</s>`; break;
      case 'code': html = `<code>${html}</code>`; break;
      case 'link': {
        const href = mark.attrs?.href;
        if (typeof href === 'string' && /^(https?:|mailto:|#)/i.test(href.trim())) {
          html = `<a href="${xmlAttr(href.trim())}">${html}</a>`;
        }
        break;
      }
      default: break;
    }
  }
  return html;
}

/** The reflowable stylesheet. Print-only settings never reach a reflowable format. */
function epubCss(input: RenderInput, options: EpubExportOptions): string {
  const t = input.design.typography;
  const e = input.design.elements;
  const bodySize = Math.round(16 * options.fontScale * 10) / 10;
  const headingSize = { compact: [1.5, 1.25, 1.1], standard: [1.9, 1.3, 1.12], dramatic: [2.3, 1.35, 1.15] }[t.headingScale];
  return `@charset "utf-8";
body{font-family:serif;font-size:${bodySize}px;line-height:${t.lineHeight};text-align:${t.align};margin:0 5%;color:#1d1a17}
h1,h2,h3,h4{font-family:${t.headings === 'serif' ? 'serif' : 'sans-serif'};line-height:1.25;break-after:avoid}
h1{font-size:${headingSize[0]}em;margin:1.2em 0 .6em}
h2{font-size:${headingSize[1]}em;margin:1.2em 0 .5em}
h3{font-size:${headingSize[2]}em;margin:1em 0 .4em}
h4{font-size:1em;margin:1em 0 .3em}
p{margin:0 0 .75em;text-indent:${t.paragraph === 'indented' ? '1.5em' : '0'}}
ul,ol{margin:0 0 .9em;padding-inline-start:1.5em}
li{margin:0 0 .3em}
blockquote{margin:1em 0;padding:.2em 1em;border-inline-start:3px solid ${e.accent};font-style:italic}
pre{background:#f5f2ef;padding:.75em;font-size:.82em;white-space:pre-wrap;overflow-wrap:anywhere}
code{font-family:monospace}
table{border-collapse:collapse;width:100%;font-size:.86em;margin:.9em 0}
th,td{padding:.35em .5em;vertical-align:top;${e.tableStyle === 'grid' ? 'border:1px solid #d9d2cc;' : 'border-bottom:1px solid #ddd5ce;'}}
thead th{background:#f6f1ec}
img{max-width:100%;height:auto}
figure{margin:1.2em 0;text-align:center}
figcaption{font-size:.82em;color:#666;margin-top:.4em;text-align:${e.captionAlign === 'center' ? 'center' : 'left'}}
a{color:${e.accent}}
hr{border:0;border-top:1px solid #ddd;margin:1.5em 0}
.title-page{text-align:center;margin:2em 0 3em}
.title-page .cover{margin:0 auto 1.5em;max-width:60%}
.title-page .cover img{max-width:100%;height:auto;display:block;margin:0 auto}
.title-page .book-title{font-size:2.4em;margin:0 0 .5em}
.title-page .subtitle{font-size:1.2em;color:#555;margin:0 0 2em}
.title-page .author{font-size:1.05em}
.title-page .rule{width:60px;height:3px;background:${e.accent};margin:0 auto 1.5em}
.copyright{font-size:.8em;color:#5d5752}
.dedication{text-align:center;font-style:italic}
.toc ol{list-style:none;padding:0;margin:0}
.toc li{margin:0 0 .55em}
.toc a{text-decoration:none;color:inherit}
.missing-image{font-style:italic;color:#666}
.page-break{break-after:page}
`;
}

function xhtml(body: string, language: string, title: string, dir: string): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${xmlAttr(language)}" lang="${xmlAttr(language)}" dir="${dir}">
<head>
<meta charset="utf-8"/>
<title>${xmlText(title)}</title>
<link rel="stylesheet" type="text/css" href="styles/book.css"/>
</head>
<body>
${body}
</body>
</html>
`;
}

/** A stable file name for a pinned image inside the package. */
function imageFileName(assetId: string, index: number): string {
  return `images/image-${index + 1}-${assetId}.webp`;
}

/**
 * Renders the EPUB package.
 *
 * The caller supplies the pinned images; this renderer only decides where they
 * go inside the package and how they are referenced.
 */
export function renderEpub(input: RenderInput, options: EpubExportOptions): EpubRenderResult {
  const { doc } = input;
  const language = documentLanguage(doc);
  const dir = doc.book.dir;
  const used = new Set<string>();
  const missingImages: string[] = [];

  const imageFiles = new Map<string, string>();
  const imageEntries: { id: string; file: string; mediaType: string; image: PinnedImage }[] = [];
  let imageIndex = 0;

  const resolveImage = (assetId: string): string | null => {
    const existing = imageFiles.get(assetId);
    if (existing) return existing;
    const image = input.images.get(assetId);
    if (!image) return null;
    const file = imageFileName(assetId, imageIndex++);
    imageFiles.set(assetId, file);
    imageEntries.push({ id: `img-${imageIndex}`, file, mediaType: image.mediaType, image });
    return file;
  };

  const ctx: InlineContext = {
    image: resolveImage,
    missing: (assetId) => { if (!missingImages.includes(assetId)) missingImages.push(assetId); },
    used,
  };

  const sections: EpubSection[] = [];
  const m = input.design.matter;
  const cover = options.includeCover ? input.cover : null;
  const coverFile = 'images/cover.webp';

  if (options.includeMatter) {
    if (m.titlePage) {
      const body = `<section class="title-page" epub:type="titlepage">
${cover ? `<div class="cover"><img src="${xmlAttr(coverFile)}" alt="${xmlAttr(doc.book.title)}"/></div>` : ''}
<h1 class="book-title">${escapeHtml(doc.book.title)}</h1>
${doc.book.subtitle ? `<p class="subtitle">${escapeHtml(doc.book.subtitle)}</p>` : ''}
<div class="rule"></div>
${doc.book.author ? `<p class="author">${escapeHtml(doc.book.author)}</p>` : ''}
</section>`;
      sections.push({ file: 'titlepage.xhtml', id: 'titlepage', title: doc.book.title, body, matter: true });
    }
    if (m.copyright.enabled) {
      sections.push({
        file: 'copyright.xhtml', id: 'copyright', title: 'Copyright',
        body: `<section class="copyright">${matterParagraphs(m.copyright.text)}</section>`, matter: true,
      });
    }
    if (m.dedication.enabled) {
      sections.push({
        file: 'dedication.xhtml', id: 'dedication', title: 'Dedication',
        body: `<section class="dedication">${matterParagraphs(m.dedication.text)}</section>`, matter: true,
      });
    }
  }

  doc.chapters.forEach((chapter, index) => {
    const number = index + 1;
    const body = `<section class="chapter" epub:type="chapter" role="doc-chapter">
<h1>${escapeHtml(chapter.title)}</h1>
${renderBlocks(chapter.content as PMNode, ctx)}
</section>`;
    sections.push({ file: `chapter-${number}.xhtml`, id: `chapter-${number}`, title: chapter.title, body, matter: false });
  });

  if (options.includeMatter) {
    if (m.aboutAuthor.enabled) {
      sections.push({
        file: 'about-author.xhtml', id: 'about-author', title: m.aboutAuthor.title,
        body: `<section class="back about">\n<h1>${escapeHtml(m.aboutAuthor.title)}</h1>\n${matterParagraphs(m.aboutAuthor.text)}</section>`, matter: true,
      });
    }
    if (m.references.enabled) {
      const list = m.references.text.split(/\n+/).filter((l) => l.trim())
        .map((l) => `<p class="reference">${escapeHtml(l.trim().normalize('NFC'))}</p>`).join('');
      sections.push({
        file: 'references.xhtml', id: 'references', title: m.references.title,
        body: `<section class="back references">\n<h1>${escapeHtml(m.references.title)}</h1>\n${list}</section>`, matter: true,
      });
    }
  }

  // Only images that a content document actually references are packaged.
  const packagedImages = imageEntries.filter((entry) => used.has(entry.image.assetId));

  const manifestItems: string[] = [];
  const spineItems: string[] = [];
  for (const section of sections) {
    manifestItems.push(`<item id="${section.id}" href="${section.file}" media-type="application/xhtml+xml"/>`);
    spineItems.push(`<itemref idref="${section.id}"/>`);
  }
  // The navigation document must be in the manifest and carry properties="nav".
  manifestItems.push('<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>');
  manifestItems.push('<item id="css" href="styles/book.css" media-type="text/css"/>');

  // The navigation document lists the chapters; the contents page lists every section.
  const navEntries = sections
    .filter((s) => !s.matter)
    .map((s) => `<li><a href="${s.file}">${xmlText(s.title)}</a></li>`)
    .join('\n');
  const tocEntries = options.includeMatter && m.contents.enabled
    ? sections.map((s) => `<li><a href="${s.file}">${xmlText(s.title)}</a></li>`).join('\n')
    : '';
  const nav = `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${xmlAttr(language)}" lang="${xmlAttr(language)}" dir="${dir}">
<head>
<meta charset="utf-8"/>
<title>${xmlText(doc.book.title)}</title>
<link rel="stylesheet" type="text/css" href="styles/book.css"/>
</head>
<body>
<nav epub:type="toc" id="toc" role="doc-toc">
<h1>${escapeHtml(m.contents.title)}</h1>
<ol>
${navEntries}
</ol>
</nav>
${tocEntries ? `<nav epub:type="landmarks" id="landmarks" hidden="hidden"><h1>Guide</h1><ol><li><a epub:type="bodymatter" href="${sections[0]?.file ?? ''}">Start of content</a></li></ol></nav>` : ''}
</body>
</html>
`;

  const identifier = `urn:uuid:${doc.book.id}-${doc.design.version}-epub`;
  const modified = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  const coverEntry = cover
    ? `<item id="cover-image" href="${coverFile}" media-type="${cover.mediaType}" properties="cover-image"/>`
    : '';
  const coverMeta = cover
    ? `<meta name="cover" content="cover-image"/>`
    : '';
  const opf = `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="pub-id" xml:lang="${xmlAttr(language)}" dir="${dir}">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/">
<dc:identifier id="pub-id">${xmlText(identifier)}</dc:identifier>
<dc:title>${xmlText(doc.book.title)}</dc:title>
${doc.book.subtitle ? `<dc:title id="sub-title">${xmlText(doc.book.subtitle)}</dc:title>` : ''}
${doc.book.author ? `<dc:creator id="creator">${xmlText(doc.book.author)}</dc:creator>` : ''}
<dc:language>${xmlText(doc.book.language)}</dc:language>
<meta property="dcterms:modified">${modified}</meta>
<meta refines="#creator" property="role" scheme="marc:relators">aut</meta>
${coverMeta}
</metadata>
<manifest>
${manifestItems.join('\n')}
${coverEntry}
</manifest>
<spine>
${spineItems.join('\n')}
</spine>
</package>
`;

  const container = `<?xml version="1.0" encoding="utf-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
<rootfiles>
<rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
</rootfiles>
</container>
`;

  const entries: { name: string; data: Buffer; store?: boolean }[] = [
    // The mimetype entry must be the first file and must be stored uncompressed.
    { name: 'mimetype', data: Buffer.from('application/epub+zip', 'utf8'), store: true },
    { name: 'META-INF/container.xml', data: Buffer.from(container, 'utf8') },
    { name: 'OEBPS/content.opf', data: Buffer.from(opf, 'utf8') },
    { name: 'OEBPS/nav.xhtml', data: Buffer.from(nav, 'utf8') },
    { name: 'OEBPS/styles/book.css', data: Buffer.from(epubCss(input, options), 'utf8') },
  ];
  for (const section of sections) {
    entries.push({ name: `OEBPS/${section.file}`, data: Buffer.from(xhtml(section.body, language, section.title, dir), 'utf8') });
  }
  for (const entry of packagedImages) {
    entries.push({ name: `OEBPS/${entry.file}`, data: entry.image.bytes });
  }
  if (cover) {
    entries.push({ name: `OEBPS/${coverFile}`, data: cover.bytes });
  }

  const buffer = buildZip(entries);
  return {
    buffer,
    facts: {
      sections: sections.length,
      chapters: sections.filter((s) => !s.matter).length,
      images: packagedImages.length,
      cover: cover ? 1 : 0,
      missingImages: missingImages.length,
      language,
      hasContents: Boolean(options.includeMatter && m.contents.enabled),
    },
  };
}
