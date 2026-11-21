import type { DocxExportOptions } from '@ebook/shared';
import type { PMNode } from '../editor/markdownToTiptap.js';
import { buildZip } from './zip.js';
import type { PinnedImage, RenderInput } from './renderTypes.js';

/**
 * DOCX renderer (WordprocessingML).
 *
 * Writes the parts a Word document needs: the content types part, the package
 * relationships, the main document, the document relationships, styles and
 * numbering. Images are written into `word/media` and referenced by relationship id.
 *
 * The table of contents is a field code, not a generated list: Word refreshes it
 * when the reader opens the document and chooses to update fields. The document
 * therefore never claims to carry computed page numbers.
 */

export interface DocxRenderResult {
  buffer: Buffer;
  facts: Record<string, string | number | boolean>;
}

/** XML text escaping. */
function xmlText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
}

/** Word requires the first character of a paragraph to be its literal text. */
function wT(value: string): string {
  const text = value.normalize('NFC').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
  return `<w:t xml:space="preserve">${xmlText(text)}</w:t>`;
}

const HEX = '0123456789ABCDEF';
/** A deterministic pseudo-random GUID derived from a seed string, so runs are reproducible. */
function guid(seed: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  const bytes = Buffer.alloc(16);
  for (let i = 0; i < 16; i++) {
    hash ^= seed.charCodeAt(i % seed.length);
    hash = Math.imul(hash, 0x01000193) >>> 0;
    bytes[i] = hash & 0xff;
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex').toUpperCase();
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

interface DocxContext {
  /** Relationship ids for external hyperlinks, keyed by URL. */
  links: Map<string, string>;
  /** Relationship ids for embedded images, keyed by asset id. */
  images: Map<string, string>;
  /** Media file name for each embedded image. */
  mediaFiles: Map<string, string>;
  /** The pinned image bytes for each embedded image, in embedding order. */
  embedded: PinnedImage[];
  missing: string[];
  linkCounter: { value: number };
  /** Increments for every drawing so each picture has a unique document id. */
  drawingCounter: number;
  /** Relationship id of the link mark currently being rendered. */
  pendingLinkId?: string;
  /** Whether a table's header row repeats at the top of each page. */
  repeatTableHeaders: boolean;
}

function addLink(ctx: DocxContext, href: string): string {
  const existing = ctx.links.get(href);
  if (existing) return existing;
  const id = `rIdLink${++ctx.linkCounter.value}`;
  ctx.links.set(href, id);
  return id;
}

/** Renders inline text with its marks applied as Word runs. */
function renderRuns(node: PMNode, ctx: DocxContext): string {
  const text = node.text ?? '';
  const marks = node.marks ?? [];
  const properties: string[] = [];
  for (const mark of marks) {
    switch (mark.type) {
      case 'bold': properties.push('<w:b/>'); break;
      case 'italic': properties.push('<w:i/>'); break;
      case 'underline': properties.push('<w:u w:val="single"/>'); break;
      case 'strike': properties.push('<w:strike/>'); break;
      case 'code': properties.push('<w:rFonts w:ascii="Consolas" w:hAnsi="Consolas"/>'); break;
      case 'link': {
        const href = mark.attrs?.href;
        if (typeof href === 'string' && /^(https?:|mailto:|#)/i.test(href.trim())) {
          const id = addLink(ctx, href.trim());
          properties.push(`<w:rStyle w:val="Link"/>`);
          ctx.pendingLinkId = id;
        }
        break;
      }
      default: break;
    }
  }
  const rPr = properties.length ? `<w:rPr>${properties.join('')}</w:rPr>` : '';
  const linkId = ctx.pendingLinkId;
  ctx.pendingLinkId = undefined;
  const run = `<w:r>${rPr}${wT(text)}</w:r>`;
  if (!linkId) return run;
  return `<w:hyperlink r:id="${linkId}">${run}</w:hyperlink>`;
}

function renderInline(node: PMNode, ctx: DocxContext): string {
  if (node.type === 'text') return renderRuns(node, ctx);
  if (node.type === 'hardBreak') return '<w:r><w:br/></w:r>';
  return '';
}

/** Paragraph properties for the design's paragraph style. */
function paragraphProperties(design: RenderInput['design'], align: string | undefined, style?: string): string {
  const properties: string[] = [];
  if (style) properties.push(`<w:pStyle w:val="${style}"/>`);
  if (design.typography.paragraph === 'indented') properties.push('<w:ind w:firstLine="360"/>');
  if (align && /^(left|right|center|justify)$/.test(align)) properties.push(`<w:jc w:val="${align}"/>`);
  return properties.length ? `<w:pPr>${properties.join('')}</w:pPr>` : '';
}

/** Renders block-level TipTap nodes as Word paragraphs. */
function renderBlocks(node: PMNode | null | undefined, ctx: DocxContext, design: RenderInput['design']): string {
  if (!node) return '';
  const children = () => (node.content ?? []).map((child) => renderBlocks(child, ctx, design)).join('');
  const align = typeof node.attrs?.textAlign === 'string' ? node.attrs.textAlign : undefined;
  switch (node.type) {
    case 'doc': return children();
    case 'paragraph': return `<w:p>${paragraphProperties(design, align)}<w:r>${inlineChildren(node, ctx)}</w:r></w:p>`;
    case 'heading': {
      const level = Math.min(4, Math.max(2, Number(node.attrs?.level) || 2));
      return `<w:p>${paragraphProperties(design, align, `Heading${level}`)}<w:r>${inlineChildren(node, ctx)}</w:r></w:p>`;
    }
    case 'bulletList': return renderList(node, ctx, design, 'ListBullet');
    case 'orderedList': return renderList(node, ctx, design, 'ListNumber');
    case 'listItem': return children();
    case 'blockquote': return `<w:p>${paragraphProperties(design, align, 'Quote')}<w:r>${inlineChildren(node, ctx)}</w:r></w:p>`;
    case 'codeBlock': {
      const text = (node.content ?? []).map((child) => child.text ?? '').join('');
      return `<w:p>${paragraphProperties(design, undefined, 'CodeBlock')}<w:r>${wT(text)}</w:r></w:p>`;
    }
    case 'horizontalRule': return '<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="d9d2cc"/></w:pBdr></w:pPr></w:p>';
    case 'table': return renderTable(node, ctx, design);
    case 'tableRow': return children();
    case 'tableHeader':
    case 'tableCell': return children();
    case 'image': return renderImage(node, ctx, design);
    case 'pageBreak': return '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';
    default: return children();
  }
}

/** Inline children of a block, each mark-aware. */
function inlineChildren(node: PMNode, ctx: DocxContext): string {
  return (node.content ?? []).map((child) => {
    if (child.type === 'text') return renderRuns(child, ctx);
    if (child.type === 'hardBreak') return '<w:br/>';
    return '';
  }).join('');
}

function renderList(node: PMNode, ctx: DocxContext, design: RenderInput['design'], style: string): string {
  const items = node.content ?? [];
  return items.map((item) => {
    // A list item holds paragraphs; each becomes one numbered paragraph.
    const paragraphs = (item.content ?? []).filter((c) => c.type === 'paragraph');
    return paragraphs.map((p) => `<w:p>${paragraphProperties(design, undefined, style)}<w:r>${inlineChildren(p, ctx)}</w:r></w:p>`).join('');
  }).join('');
}

function renderTable(node: PMNode, ctx: DocxContext, design: RenderInput['design']): string {
  const rows = node.content ?? [];
  const headed = rows.length > 1 && (rows[0].content ?? []).every((cell) => cell.type === 'tableHeader');
  const border = design.elements.tableStyle === 'grid';
  const borders = border
    ? '<w:tblBorders><w:top w:val="single" w:sz="4" w:color="d9d2cc"/><w:left w:val="single" w:sz="4" w:color="d9d2cc"/><w:bottom w:val="single" w:sz="4" w:color="d9d2cc"/><w:right w:val="single" w:sz="4" w:color="d9d2cc"/><w:insideH w:val="single" w:sz="4" w:color="d9d2cc"/><w:insideV w:val="single" w:sz="4" w:color="d9d2cc"/></w:tblBorders>'
    : '<w:tblBorders><w:bottom w:val="single" w:sz="4" w:color="ddd5ce"/></w:tblBorders>';
  const body = rows.map((row, rowIndex) => {
    const header = headed && rowIndex === 0;
    const cells = (row.content ?? []).map((cell) => {
      const content = (cell.content ?? []).map((p) => `<w:p>${paragraphProperties(design, undefined, header ? 'TableHeader' : 'TableText')}<w:r>${inlineChildren(p, ctx)}</w:r></w:p>`).join('');
      const headerProperty = header ? '<w:tcPr><w:shd w:val="clear" w:fill="f6f1ec"/></w:tcPr>' : '';
      return `<w:tc>${headerProperty}${content || '<w:p/>'}</w:tc>`;
    }).join('');
    const headerRepeat = header && ctx.repeatTableHeaders ? '<w:trPr><w:tblHeader/></w:trPr>' : '';
    return `<w:tr>${headerRepeat}${cells}</w:tr>`;
  }).join('');
  return `<w:tbl><w:tblPr><w:tblStyle w:val="TableGrid"/><w:tblW w:w="5000" w:type="pct"/>${borders}</w:tblPr>${body}</w:tbl><w:p/>`;
}

function renderImage(node: PMNode, ctx: DocxContext, design: RenderInput['design']): string {
  const assetId = String(node.attrs?.assetId ?? '');
  const image = ctx.embedded.find((i) => i.assetId === assetId);
  if (!image) {
    if (!ctx.missing.includes(assetId)) ctx.missing.push(assetId);
    // The caption is kept so the information is not lost when an image is unavailable.
    const caption = String(node.attrs?.caption ?? '').normalize('NFC');
    return `<w:p>${paragraphProperties(design, undefined, 'ImageMissing')}<w:r>${wT(caption || String(node.attrs?.alt ?? ''))}</w:r></w:p>`;
  }
  const relId = ctx.images.get(assetId)!;
  // The text block is 6.5 in wide; the design scales the image within it.
  const maxWidthEmu = 5_943_600 * (design.elements.imageWidth === 'medium' ? 0.7 : 1);
  const ratio = image.width > 0 ? image.height / image.width : 1;
  const width = Math.round(maxWidthEmu);
  const height = Math.round(maxWidthEmu * ratio);
  const alt = String(node.attrs?.alt ?? '').normalize('NFC');
  const caption = String(node.attrs?.caption ?? '').normalize('NFC');
  const drawing = `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0">
<wp:extent cx="${width}" cy="${height}"/>
<wp:effectExtent l="0" t="0" r="0" b="0"/>
<wp:docPr id="${ctx.drawingCounter++}" name="Picture ${ctx.drawingCounter}" descr="${xmlText(alt)}"/>
<wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr>
<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">
<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
<pic:nvPicPr><pic:cNvPr id="0" name="image" descr="${xmlText(alt)}"/><pic:cNvPicPr/></pic:nvPicPr>
<pic:blipFill><a:blip r:embed="${relId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>
<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${width}" cy="${height}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>
</pic:pic>
</a:graphicData></a:graphic>
</wp:inline></w:drawing></w:r>`;
  const captionParagraph = caption
    ? `<w:p><w:pPr><w:jc w:val="${design.elements.captionAlign === 'center' ? 'center' : 'left'}"/></w:pPr><w:r><w:rPr><w:i/><w:sz w:val="18"/></w:rPr>${wT(caption)}</w:r></w:p>`
    : '';
  return `<w:p><w:pPr><w:jc w:val="center"/></w:pPr>${drawing}</w:p>${captionParagraph}`;
}

/** The styles part: Normal, headings, list styles, quote, code and table text. */
function stylesXml(design: RenderInput['design'], options: DocxExportOptions): string {
  const size = Math.round(options.fontSizePt * 2);
  const headingSizes = [40, 32, 26, 23, 22];
  // Heading 1 is the chapter title; headings 2 to 4 come from the manuscript.
  const headingXml = [1, 2, 3, 4].map((level) => `<w:style w:type="paragraph" w:styleId="Heading${level}">
<w:name w:val="heading ${level}"/>
<w:basedOn w:val="Normal"/>
<w:next w:val="Normal"/>
<w:qFormat/>
<w:pPr><w:keepNext/><w:outlineLvl w:val="${level - 1}"/><w:spacing w:before="${level === 1 ? 360 : level === 2 ? 320 : 240}" w:after="120"/></w:pPr>
<w:rPr><w:b/><w:sz w:val="${headingSizes[level - 1]}"/><w:szCs w:val="${headingSizes[level - 1]}"/></w:rPr>
</w:style>`).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:docDefaults><w:rPrDefault><w:rPr><w:sz w:val="${size}"/><w:szCs w:val="${size}"/><w:lang w:val="${xmlText(design.typography.align ? 'en' : 'en')}"/></w:rPr></w:rPrDefault>
<w:pPrDefault><w:pPr><w:spacing w:after="${design.typography.paragraph === 'indented' ? 0 : 120}" w:line="${Math.round(design.typography.lineHeight * 240)}" w:lineRule="auto"/></w:pPr></w:pPrDefault>
</w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal">
<w:name w:val="Normal"/><w:qFormat/>
<w:rPr><w:rFonts w:ascii="Georgia" w:hAnsi="Georgia"/><w:sz w:val="${size}"/><w:szCs w:val="${size}"/></w:rPr>
</w:style>
${headingXml}
<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:qFormat/>
<w:pPr><w:jc w:val="center"/><w:spacing w:after="240"/></w:pPr>
<w:rPr><w:b/><w:sz w:val="56"/><w:szCs w:val="56"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Subtitle"><w:name w:val="Subtitle"/><w:basedOn w:val="Normal"/>
<w:pPr><w:jc w:val="center"/></w:pPr><w:rPr><w:sz w:val="28"/><w:szCs w:val="28"/><w:color w:val="555555"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Quote"><w:name w:val="Quote"/><w:basedOn w:val="Normal"/>
<w:pPr><w:ind w:left="480"/><w:spacing w:before="120" w:after="120"/></w:pPr>
<w:rPr><w:i/><w:color w:val="444444"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="CodeBlock"><w:name w:val="Code Block"/><w:basedOn w:val="Normal"/>
<w:pPr><w:shd w:val="clear" w:fill="f5f2ef"/><w:spacing w:before="120" w:after="120"/></w:pPr>
<w:rPr><w:rFonts w:ascii="Consolas" w:hAnsi="Consolas"/><w:sz w:val="${Math.round(size * 0.85)}"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="ListBullet"><w:name w:val="List Bullet"/><w:basedOn w:val="Normal"/>
<w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr><w:spacing w:after="60"/></w:pPr></w:style>
<w:style w:type="paragraph" w:styleId="ListNumber"><w:name w:val="List Number"/><w:basedOn w:val="Normal"/>
<w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="2"/></w:numPr><w:spacing w:after="60"/></w:pPr></w:style>
<w:style w:type="paragraph" w:styleId="TableText"><w:name w:val="Table Text"/><w:basedOn w:val="Normal"/>
<w:pPr><w:spacing w:after="0"/></w:pPr><w:rPr><w:sz w:val="${Math.round(size * 0.9)}"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="TableHeader"><w:name w:val="Table Header"/><w:basedOn w:val="TableText"/>
<w:rPr><w:b/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="ImageMissing"><w:name w:val="Image Missing"/><w:basedOn w:val="Normal"/>
<w:rPr><w:i/><w:color w:val="666666"/></w:rPr></w:style>
<w:style w:type="character" w:styleId="Link"><w:name w:val="Hyperlink"/><w:rPr><w:color w:val="0563C1"/><w:u w:val="single"/></w:rPr></w:style>
<w:style w:type="table" w:styleId="TableGrid"><w:name w:val="Table Grid"/>
<w:tblPr><w:tblBorders><w:top w:val="single" w:sz="4" w:color="d9d2cc"/><w:left w:val="single" w:sz="4" w:color="d9d2cc"/><w:bottom w:val="single" w:sz="4" w:color="d9d2cc"/><w:right w:val="single" w:sz="4" w:color="d9d2cc"/><w:insideH w:val="single" w:sz="4" w:color="d9d2cc"/><w:insideV w:val="single" w:sz="4" w:color="d9d2cc"/></w:tblBorders></w:tblPr></w:style>
</w:styles>
`;
}

/** The numbering part: one bullet list and one numbered list. */
function numberingXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:abstractNum w:abstractNumId="0">
<w:multiLevelType w:val="hybridMultilevel"/>
<w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="&#8226;"/><w:lvlJc w:val="left"/>
<w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr>
<w:rPr><w:rFonts w:ascii="Symbol" w:hAnsi="Symbol" w:hint="default"/></w:rPr></w:lvl>
</w:abstractNum>
<w:abstractNum w:abstractNumId="1">
<w:multiLevelType w:val="hybridMultilevel"/>
<w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%1."/><w:lvlJc w:val="left"/>
<w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr></w:lvl>
</w:abstractNum>
<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>
<w:num w:numId="2"><w:abstractNumId w:val="1"/></w:num>
</w:numbering>
`;
}

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Default Extension="webp" ContentType="image/webp"/>
<Default Extension="png" ContentType="image/png"/>
<Default Extension="jpeg" ContentType="image/jpeg"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
<Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>
<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>
`;

const PACKAGE_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>
`;

/** Renders the DOCX package. */
export function renderDocx(input: RenderInput, options: DocxExportOptions): DocxRenderResult {
  const { doc } = input;
  const design = input.design;
  const m = design.matter;
  const ctx: DocxContext = {
    links: new Map(),
    images: new Map(),
    mediaFiles: new Map(),
    embedded: [],
    missing: [],
    linkCounter: { value: 0 },
    drawingCounter: 1,
    repeatTableHeaders: options.repeatTableHeaders,
  };

  // Collect the images that the manuscript references so each is written once.
  const assetIds = new Set<string>();
  const walk = (node: unknown) => {
    const pending = [node];
    while (pending.length) {
      const current = pending.pop() as { type?: string; attrs?: { assetId?: string }; content?: unknown[] } | null;
      if (!current || typeof current !== 'object') continue;
      if (current.type === 'image' && typeof current.attrs?.assetId === 'string') assetIds.add(current.attrs.assetId);
      if (current.content) pending.push(...current.content);
    }
  };
  for (const chapter of doc.chapters) walk(chapter.content);

  let imageCounter = 0;
  for (const assetId of assetIds) {
    const image = input.images.get(assetId);
    if (!image) continue;
    const file = `image-${++imageCounter}.webp`;
    ctx.mediaFiles.set(assetId, file);
    ctx.images.set(assetId, `rIdImg${imageCounter}`);
    ctx.embedded.push(image);
  }

  const body: string[] = [];
  if (options.includeMatter) {
    if (m.titlePage) {
      body.push(`<w:p><w:pPr><w:pStyle w:val="Title"/></w:pPr><w:r>${wT(doc.book.title)}</w:r></w:p>`);
      if (doc.book.subtitle) body.push(`<w:p><w:pPr><w:pStyle w:val="Subtitle"/></w:pPr><w:r>${wT(doc.book.subtitle)}</w:r></w:p>`);
      if (doc.book.author) body.push(`<w:p><w:pPr><w:pStyle w:val="Subtitle"/></w:pPr><w:r>${wT(doc.book.author)}</w:r></w:p>`);
      body.push('<w:p><w:r><w:br w:type="page"/></w:r></w:p>');
    }
    if (m.copyright.enabled) {
      for (const paragraph of m.copyright.text.trim().split(/\n\s*\n/).filter((p) => p.trim())) {
        body.push(`<w:p><w:r>${wT(paragraph.replace(/\n/g, ' '))}</w:r></w:p>`);
      }
      body.push('<w:p><w:r><w:br w:type="page"/></w:r></w:p>');
    }
    if (m.dedication.enabled) {
      for (const paragraph of m.dedication.text.trim().split(/\n\s*\n/).filter((p) => p.trim())) {
        body.push(`<w:p><w:pPr><w:pStyle w:val="Quote"/><w:jc w:val="center"/></w:pPr><w:r>${wT(paragraph.replace(/\n/g, ' '))}</w:r></w:p>`);
      }
      body.push('<w:p><w:r><w:br w:type="page"/></w:r></w:p>');
    }
  }

  // The table of contents is a field code: Word computes it when the reader updates fields.
  if (options.includeMatter && m.contents.enabled) {
    body.push(`<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r>${wT(m.contents.title)}</w:r></w:p>`);
    body.push('<w:p><w:r><w:fldChar w:fldCharType="begin" w:dirty="true"/></w:r><w:r><w:instrText xml:space="preserve"> TOC \\o "1-3" \\h \\z \\u </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>Right-click and choose "Update field" to build the table of contents.</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r></w:p>');
    body.push('<w:p><w:r><w:br w:type="page"/></w:r></w:p>');
  }

  for (const chapter of doc.chapters) {
    body.push(`<w:p><w:pPr><w:pStyle w:val="Heading1"/><w:pageBreakBefore/></w:pPr><w:r>${wT(chapter.title)}</w:r></w:p>`);
    body.push(renderBlocks(chapter.content as PMNode, ctx, design));
  }

  if (options.includeMatter) {
    if (m.aboutAuthor.enabled) {
      body.push(`<w:p><w:pPr><w:pStyle w:val="Heading1"/><w:pageBreakBefore/></w:pPr><w:r>${wT(m.aboutAuthor.title)}</w:r></w:p>`);
      for (const paragraph of m.aboutAuthor.text.trim().split(/\n\s*\n/).filter((p) => p.trim())) {
        body.push(`<w:p><w:r>${wT(paragraph.replace(/\n/g, ' '))}</w:r></w:p>`);
      }
    }
    if (m.references.enabled) {
      body.push(`<w:p><w:pPr><w:pStyle w:val="Heading1"/><w:pageBreakBefore/></w:pPr><w:r>${wT(m.references.title)}</w:r></w:p>`);
      for (const line of m.references.text.split(/\n+/).filter((l) => l.trim())) {
        body.push(`<w:p><w:r>${wT(line.trim())}</w:r></w:p>`);
      }
    }
  }

  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
<w:body>
${body.join('\n')}
<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr>
</w:body>
</w:document>
`;

  // Document relationships: styles, numbering, hyperlinks and images.
  const relationships: string[] = [
    '<Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>',
    '<Relationship Id="rIdNumbering" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>',
  ];
  for (const [href, id] of ctx.links) {
    relationships.push(`<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="${xmlText(href)}" TargetMode="External"/>`);
  }
  for (const [assetId, id] of ctx.images) {
    const file = ctx.mediaFiles.get(assetId)!;
    relationships.push(`<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${file}"/>`);
  }
  const documentRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${relationships.join('\n')}
</Relationships>
`;

  const core = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:title>${xmlText(doc.book.title)}</dc:title>
${doc.book.subtitle ? `<dc:subject>${xmlText(doc.book.subtitle)}</dc:subject>` : ''}
${doc.book.author ? `<dc:creator>${xmlText(doc.book.author)}</dc:creator>` : ''}
<dc:language>${xmlText(doc.book.language)}</dc:language>
</cp:coreProperties>
`;

  const app = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties">
<Application>eBookStudio</Application>
</Properties>
`;

  const entries: { name: string; data: Buffer; store?: boolean }[] = [
    { name: '[Content_Types].xml', data: Buffer.from(CONTENT_TYPES, 'utf8') },
    { name: '_rels/.rels', data: Buffer.from(PACKAGE_RELS, 'utf8') },
    { name: 'docProps/core.xml', data: Buffer.from(core, 'utf8') },
    { name: 'docProps/app.xml', data: Buffer.from(app, 'utf8') },
    { name: 'word/document.xml', data: Buffer.from(documentXml, 'utf8') },
    { name: 'word/_rels/document.xml.rels', data: Buffer.from(documentRels, 'utf8') },
    { name: 'word/styles.xml', data: Buffer.from(stylesXml(design, options), 'utf8') },
    { name: 'word/numbering.xml', data: Buffer.from(numberingXml(), 'utf8') },
  ];
  for (const image of ctx.embedded) {
    const file = ctx.mediaFiles.get(image.assetId)!;
    entries.push({ name: `word/media/${file}`, data: image.bytes });
  }

  const buffer = buildZip(entries);
  return {
    buffer,
    facts: {
      parts: entries.length,
      chapters: doc.chapters.length,
      images: ctx.embedded.length,
      links: ctx.links.size,
      missingImages: ctx.missing.length,
      // Word, not this renderer, computes the table of contents.
      tocIsField: Boolean(options.includeMatter && m.contents.enabled),
    },
  };
}
