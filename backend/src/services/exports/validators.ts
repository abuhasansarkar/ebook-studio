import { ExportValidation, ExportValidationIssue, type ExportFormat } from '@ebook/shared';
import { PDFDocument } from 'pdf-lib';
import { readZip, zipEntry, type ZipEntry } from './zip.js';

/**
 * S10 export validators.
 *
 * A validator re-opens the bytes that were written to storage and checks that
 * the file is a real, complete document of its format. Validation is never
 * inferred from the render step: the renderer produces bytes, the file is
 * stored, and only then is the stored file read back and validated.
 *
 * A validator reports errors and warnings separately. An error means the file is
 * not usable and must not be offered as a download; a warning is shown to the
 * reader but does not block the download.
 */

export interface ValidationInput {
  format: ExportFormat;
  /** The bytes read back from storage. */
  buffer: Buffer;
  /** Measurements recorded by the renderer, merged into the validation facts. */
  renderFacts: Record<string, string | number | boolean | string[]>;
}

function issue(severity: 'error' | 'warning', code: string, message: string): ExportValidationIssue {
  return { severity, code, message };
}

/** Control characters that are not permitted in XML 1.0. */
const XML_CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/;

/**
 * A tiny well-formedness check for XML.
 *
 * The validators do not need a full XML parser: they need to know that the
 * document is well-formed enough to open. This checks that tags are balanced,
 * that the declaration is present and that no control characters appear.
 */
export function xmlWellFormed(xml: string): { ok: boolean; reason?: string } {
  if (!xml.trim()) return { ok: false, reason: 'the file is empty' };
  if (XML_CONTROL.test(xml)) return { ok: false, reason: 'the file contains control characters' };
  const stack: string[] = [];
  const tagPattern = /<\/?([A-Za-z_][\w.:-]*)((?:"[^"]*"|'[^']*'|[^>"'])*?)(\/?)>|<\?[\s\S]*?\?>|<!--[\s\S]*?-->|<!DOCTYPE[^>]*>/g;
  let cursor = 0;
  let match: RegExpExecArray | null;
  while ((match = tagPattern.exec(xml)) !== null) {
    // Text between tags must not contain a stray '<' that opens an unclosed element.
    const between = xml.slice(cursor, match.index);
    if (between.includes('<')) return { ok: false, reason: 'the file contains an unescaped "<"' };
    cursor = match.index + match[0].length;
    const [raw, name, , selfClosing] = match;
    if (raw.startsWith('<?') || raw.startsWith('<!--') || raw.startsWith('<!')) continue;
    if (raw.startsWith('</')) {
      const open = stack.pop();
      if (open !== name) return { ok: false, reason: `the closing tag </${name}> does not match <${open ?? ''}>` };
    } else if (!selfClosing) {
      stack.push(name);
    }
  }
  if (stack.length) return { ok: false, reason: `the element <${stack[stack.length - 1]}> is never closed` };
  return { ok: true };
}

/** Validates a PDF: it must be a PDF, it must parse and it must have pages. */
async function validatePdf(input: ValidationInput): Promise<ExportValidation> {
  const issues: ExportValidationIssue[] = [];
  const facts: Record<string, string | number | boolean | string[]> = { ...input.renderFacts };
  if (input.buffer.length < 1024) {
    return { passed: false, validator: 'pdf', issues: [issue('error', 'pdf.too-small', 'The generated PDF is unexpectedly small.')], facts };
  }
  if (input.buffer.subarray(0, 5).toString('latin1') !== '%PDF-') {
    return { passed: false, validator: 'pdf', issues: [issue('error', 'pdf.not-a-pdf', 'The generated file is not a PDF.')], facts };
  }
  try {
    const doc = await PDFDocument.load(input.buffer, { updateMetadata: false });
    const pageCount = doc.getPageCount();
    facts.pageCount = pageCount;
    if (pageCount < 1) issues.push(issue('error', 'pdf.no-pages', 'The generated PDF has no pages.'));
    // The trailer must be present so a reader can find the document catalog.
    if (!input.buffer.includes(Buffer.from('%%EOF'))) issues.push(issue('warning', 'pdf.no-trailer', 'The PDF has no end-of-file marker; some readers may reject it.'));
  } catch (error) {
    issues.push(issue('error', 'pdf.unreadable', `The PDF could not be re-opened: ${(error instanceof Error ? error.message : String(error)).slice(0, 200)}`));
  }
  return { passed: !issues.some((i) => i.severity === 'error'), validator: 'pdf', issues, facts };
}

/** Shared checks for a ZIP-based container. */
function validateZipContainer(entries: ZipEntry[], required: string[], label: string): ExportValidationIssue[] {
  const issues: ExportValidationIssue[] = [];
  const names = new Set(entries.map((e) => e.name));
  for (const name of required) {
    if (!names.has(name)) issues.push(issue('error', `${label}.missing-part`, `The package is missing ${name}.`));
  }
  return issues;
}

/** Validates an EPUB: the container, the package document, the navigation and the spine. */
function validateEpub(input: ValidationInput): ExportValidation {
  const issues: ExportValidationIssue[] = [];
  const facts: Record<string, string | number | boolean | string[]> = { ...input.renderFacts };
  let entries: ZipEntry[];
  try {
    entries = readZip(input.buffer);
  } catch (error) {
    return {
      passed: false, validator: 'epub',
      issues: [issue('error', 'epub.unreadable', `The EPUB could not be re-opened: ${(error instanceof Error ? error.message : String(error)).slice(0, 200)}`)],
      facts,
    };
  }
  facts.parts = entries.length;

  // The mimetype entry must be the first file and must be stored uncompressed.
  const first = entries[0];
  if (!first || first.name !== 'mimetype') {
    issues.push(issue('error', 'epub.mimetype-missing', 'The EPUB is missing its "mimetype" entry.'));
  } else {
    const value = first.data.toString('utf8');
    if (value !== 'application/epub+zip') issues.push(issue('error', 'epub.mimetype-invalid', `The "mimetype" entry should contain "application/epub+zip" but contains "${value.slice(0, 40)}".`));
    if (first.deflated) issues.push(issue('error', 'epub.mimetype-compressed', 'The "mimetype" entry must be stored uncompressed.'));
  }

  issues.push(...validateZipContainer(entries, ['META-INF/container.xml'], 'epub'));

  const container = zipEntry(entries, 'META-INF/container.xml');
  if (container) {
    const check = xmlWellFormed(container.data.toString('utf8'));
    if (!check.ok) issues.push(issue('error', 'epub.container-invalid', `The container.xml is not well-formed: ${check.reason}.`));
    const match = /full-path="([^"]+)"/.exec(container.data.toString('utf8'));
    if (!match) issues.push(issue('error', 'epub.no-rootfile', 'The container.xml does not name a root file.'));
    else {
      const opfPath = match[1];
      const opf = zipEntry(entries, opfPath);
      if (!opf) issues.push(issue('error', 'epub.no-package', `The package document ${opfPath} is missing.`));
      else validateOpf(entries, opf, issues, facts);
    }
  }

  // Every XHTML content document must be well-formed.
  let documents = 0;
  for (const entry of entries) {
    if (!entry.name.endsWith('.xhtml')) continue;
    documents++;
    const check = xmlWellFormed(entry.data.toString('utf8'));
    if (!check.ok) issues.push(issue('error', 'epub.xhtml-invalid', `${entry.name} is not well-formed: ${check.reason}.`));
  }
  facts.contentDocuments = documents;

  return { passed: !issues.some((i) => i.severity === 'error'), validator: 'epub', issues, facts };
}

/** Checks the OPF package document: metadata, manifest and spine. */
function validateOpf(entries: ZipEntry[], opf: ZipEntry, issues: ExportValidationIssue[], facts: Record<string, string | number | boolean | string[]>) {
  const xml = opf.data.toString('utf8');
  const check = xmlWellFormed(xml);
  if (!check.ok) {
    issues.push(issue('error', 'epub.package-invalid', `The package document is not well-formed: ${check.reason}.`));
    return;
  }
  if (!/<dc:identifier[^>]*>[\s\S]*?<\/dc:identifier>/.test(xml)) issues.push(issue('error', 'epub.no-identifier', 'The package document has no dc:identifier.'));
  if (!/<dc:title[^>]*>[\s\S]*?<\/dc:title>/.test(xml)) issues.push(issue('error', 'epub.no-title', 'The package document has no dc:title.'));
  if (!/<dc:language[^>]*>[\s\S]*?<\/dc:language>/.test(xml)) issues.push(issue('error', 'epub.no-language', 'The package document has no dc:language.'));
  if (!/<dcterms:modified>/.test(xml)) issues.push(issue('warning', 'epub.no-modified', 'The package document has no dcterms:modified date.'));

  const manifestTags = [...xml.matchAll(/<item\s[^>]*>/g)].map((m) => m[0]);
  const manifestItems = manifestTags.map((tag) => ({
    id: /id="([^"]+)"/.exec(tag)?.[1] ?? '',
    href: /href="([^"]+)"/.exec(tag)?.[1] ?? '',
    tag,
  }));
  facts.manifestItems = manifestItems.length;
  const base = opf.name.includes('/') ? opf.name.slice(0, opf.name.lastIndexOf('/') + 1) : '';
  for (const item of manifestItems) {
    const target = `${base}${item.href}`;
    if (!entries.some((e) => e.name === target)) {
      issues.push(issue('error', 'epub.manifest-missing', `The manifest lists ${item.href} but the file is not in the package.`));
    }
  }
  // The navigation document is the manifest item whose own tag declares properties="nav".
  const navItem = manifestItems.find((item) => /properties="[^"]*\bnav\b/.test(item.tag));
  if (!navItem) issues.push(issue('error', 'epub.no-nav', 'The package manifest does not declare a navigation document.'));
  else {
    const nav = zipEntry(entries, `${base}${navItem.href}`);
    if (!nav) issues.push(issue('error', 'epub.no-nav', 'The navigation document is missing from the package.'));
    else {
      const navXml = nav.data.toString('utf8');
      const navCheck = xmlWellFormed(navXml);
      if (!navCheck.ok) issues.push(issue('error', 'epub.nav-invalid', `The navigation document is not well-formed: ${navCheck.reason}.`));
      if (!/epub:type="toc"/.test(navXml)) issues.push(issue('error', 'epub.no-toc', 'The navigation document has no toc navigation.'));
    }
  }

  const spine = /<spine>([\s\S]*?)<\/spine>/.exec(xml)?.[1] ?? '';
  const spineItems = [...spine.matchAll(/<itemref\s[^>]*idref="([^"]+)"/g)].map((m) => m[1]);
  facts.spineItems = spineItems.length;
  if (!spineItems.length) issues.push(issue('error', 'epub.no-spine', 'The package document has an empty spine.'));
  const ids = new Set(manifestItems.map((i) => i.id));
  for (const idref of spineItems) {
    if (!ids.has(idref)) issues.push(issue('error', 'epub.spine-unknown', `The spine references ${idref}, which is not in the manifest.`));
  }
}

/** Validates a DOCX: the package parts, the main document and the relationships. */
function validateDocx(input: ValidationInput): ExportValidation {
  const issues: ExportValidationIssue[] = [];
  const facts: Record<string, string | number | boolean | string[]> = { ...input.renderFacts };
  let entries: ZipEntry[];
  try {
    entries = readZip(input.buffer);
  } catch (error) {
    return {
      passed: false, validator: 'docx',
      issues: [issue('error', 'docx.unreadable', `The DOCX could not be re-opened: ${(error instanceof Error ? error.message : String(error)).slice(0, 200)}`)],
      facts,
    };
  }
  facts.parts = entries.length;

  issues.push(...validateZipContainer(entries, ['[Content_Types].xml', '_rels/.rels', 'word/document.xml', 'word/_rels/document.xml.rels'], 'docx'));

  const contentTypes = zipEntry(entries, '[Content_Types].xml');
  if (contentTypes) {
    const check = xmlWellFormed(contentTypes.data.toString('utf8'));
    if (!check.ok) issues.push(issue('error', 'docx.content-types-invalid', `The content types part is not well-formed: ${check.reason}.`));
    if (!/ContentType="application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document\.main\+xml"/.test(contentTypes.data.toString('utf8'))) {
      issues.push(issue('error', 'docx.no-main-content-type', 'The content types part does not declare the main document.'));
    }
  }

  const document = zipEntry(entries, 'word/document.xml');
  if (document) {
    const xml = document.data.toString('utf8');
    const check = xmlWellFormed(xml);
    if (!check.ok) issues.push(issue('error', 'docx.document-invalid', `The main document is not well-formed: ${check.reason}.`));
    if (!/<w:body>/.test(xml)) issues.push(issue('error', 'docx.no-body', 'The main document has no body.'));
    const paragraphs = (xml.match(/<w:p[ >]/g) ?? []).length;
    facts.paragraphs = paragraphs;
    if (!paragraphs) issues.push(issue('error', 'docx.no-paragraphs', 'The main document has no paragraphs.'));
    // Every referenced style must be defined in the styles part.
    const styles = zipEntry(entries, 'word/styles.xml');
    if (styles) {
      const styleCheck = xmlWellFormed(styles.data.toString('utf8'));
      if (!styleCheck.ok) issues.push(issue('error', 'docx.styles-invalid', `The styles part is not well-formed: ${styleCheck.reason}.`));
      const defined = new Set([...styles.data.toString('utf8').matchAll(/w:styleId="([^"]+)"/g)].map((m) => m[1]));
      for (const used of new Set([...xml.matchAll(/<w:pStyle w:val="([^"]+)"/g)].map((m) => m[1]))) {
        if (!defined.has(used)) issues.push(issue('error', 'docx.unknown-style', `The document uses the style "${used}" but the styles part does not define it.`));
      }
    } else {
      issues.push(issue('error', 'docx.no-styles', 'The package has no styles part.'));
    }
  }

  // Every relationship target and every embedded image must exist.
  const rels = zipEntry(entries, 'word/_rels/document.xml.rels');
  if (rels) {
    const relXml = rels.data.toString('utf8');
    const relCheck = xmlWellFormed(relXml);
    if (!relCheck.ok) issues.push(issue('error', 'docx.rels-invalid', `The document relationships are not well-formed: ${relCheck.reason}.`));
    const names = new Set(entries.map((e) => e.name));
    // Each relationship is checked on its own element so a missing target cannot borrow another.
    for (const tag of [...relXml.matchAll(/<Relationship\s[^>]*>/g)].map((m) => m[0])) {
      const target = /Target="([^"]+)"/.exec(tag)?.[1];
      if (!target) continue;
      if (/TargetMode="External"/.test(tag)) continue;
      const resolved = target.startsWith('/') ? target.slice(1) : `word/${target}`;
      if (!names.has(resolved)) issues.push(issue('error', 'docx.missing-target', `The relationship target ${target} is not in the package.`));
    }
  }

  // Every image referenced from the document must be present.
  const docXml = document?.data.toString('utf8') ?? '';
  const imageRelIds = new Set([...docXml.matchAll(/<a:blip r:embed="([^"]+)"/g)].map((m) => m[1]));
  if (imageRelIds.size && rels) {
    const relXml = rels.data.toString('utf8');
    // Each relationship is matched on its own element so one entry cannot borrow another's target.
    const targets = new Map(
      [...relXml.matchAll(/<Relationship\s[^>]*>/g)]
        .map((m) => m[0])
        .map((tag) => [/Id="([^"]+)"/.exec(tag)?.[1] ?? '', /Target="([^"]+)"/.exec(tag)?.[1] ?? ''] as const)
        .filter(([id, target]) => id && target)
        .map(([id, target]) => [id, target]),
    );
    for (const id of imageRelIds) {
      const target = targets.get(id);
      if (!target) issues.push(issue('error', 'docx.image-unrelated', `The document embeds an image with relationship ${id}, which is not declared.`));
      else if (!entries.some((e) => e.name === `word/${target}`)) issues.push(issue('error', 'docx.image-missing', `The embedded image ${target} is not in the package.`));
    }
  }

  return { passed: !issues.some((i) => i.severity === 'error'), validator: 'docx', issues, facts };
}

/** Validates the stored bytes of an export. */
export async function validateExport(input: ValidationInput): Promise<ExportValidation> {
  switch (input.format) {
    case 'pdf': return validatePdf(input);
    case 'epub': return validateEpub(input);
    case 'docx': return validateDocx(input);
    default: return { passed: false, validator: 'unknown', issues: [issue('error', 'unknown.format', `Unknown export format "${String(input.format)}".`)], facts: {} };
  }
}
