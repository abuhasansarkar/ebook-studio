import { describe, expect, it } from 'vitest';
import { buildZip } from '../src/services/exports/zip.js';
import { validateExport, xmlWellFormed } from '../src/services/exports/validators.js';

/**
 * Regression checks for the export validators.
 *
 * Each case below is a bug that a real export hit: a manifest whose navigation
 * entry was masked by a neighbouring item, a package document with an
 * undeclared namespace prefix, and a document whose heading style was never
 * defined. The validators must catch these rather than pass them.
 */

describe('export validators', () => {
  it('finds the navigation document by its own manifest entry, not a neighbour', async () => {
    // The title-page item precedes the nav item; a windowed search would match
    // the nav item's properties when checking the title page.
    const opf = `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="pub-id">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/">
<dc:identifier id="pub-id">urn:uuid:x</dc:identifier>
<dc:title>T</dc:title>
<dc:language>en</dc:language>
<meta property="dcterms:modified">2026-01-01T00:00:00Z</meta>
</metadata>
<manifest>
<item id="titlepage" href="titlepage.xhtml" media-type="application/xhtml+xml"/>
<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
</manifest>
<spine><itemref idref="titlepage"/></spine>
</package>`;
    const nav = `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>T</title></head>
<body><nav epub:type="toc" id="toc"><ol><li><a href="titlepage.xhtml">T</a></li></ol></nav></body></html>`;
    const titlepage = `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml"><head><title>T</title></head><body><h1>T</h1></body></html>`;
    const buffer = buildZip([
      { name: 'mimetype', data: Buffer.from('application/epub+zip'), store: true },
      { name: 'META-INF/container.xml', data: Buffer.from(`<?xml version="1.0" encoding="utf-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`) },
      { name: 'OEBPS/content.opf', data: Buffer.from(opf) },
      { name: 'OEBPS/nav.xhtml', data: Buffer.from(nav) },
      { name: 'OEBPS/titlepage.xhtml', data: Buffer.from(titlepage) },
    ]);
    const validation = await validateExport({ format: 'epub', buffer, renderFacts: {} });
    expect(validation.issues.filter((i) => i.severity === 'error')).toEqual([]);
    expect(validation.passed).toBe(true);
    // The declared dcterms prefix means the modified date is recognised.
    expect(validation.issues.some((i) => i.code === 'epub.no-modified')).toBe(false);
  });

  it('rejects a package document that declares no navigation document', async () => {
    const opf = `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="pub-id">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:identifier id="pub-id">urn:uuid:x</dc:identifier><dc:title>T</dc:title><dc:language>en</dc:language>
</metadata>
<manifest><item id="c1" href="chapter-1.xhtml" media-type="application/xhtml+xml"/></manifest>
<spine><itemref idref="c1"/></spine>
</package>`;
    const buffer = buildZip([
      { name: 'mimetype', data: Buffer.from('application/epub+zip'), store: true },
      { name: 'META-INF/container.xml', data: Buffer.from(`<?xml version="1.0" encoding="utf-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`) },
      { name: 'OEBPS/content.opf', data: Buffer.from(opf) },
    ]);
    const validation = await validateExport({ format: 'epub', buffer, renderFacts: {} });
    expect(validation.passed).toBe(false);
    expect(validation.issues.some((i) => i.code === 'epub.no-nav')).toBe(true);
  });

  it('rejects a DOCX whose document uses a style the styles part does not define', async () => {
    const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>
<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Chapter</w:t></w:r></w:p>
</w:body></w:document>`;
    const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:style w:type="paragraph" w:styleId="Normal"><w:name w:val="Normal"/></w:style>
</w:styles>`;
    const buffer = buildZip([
      { name: '[Content_Types].xml', data: Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>`) },
      { name: '_rels/.rels', data: Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`) },
      { name: 'word/document.xml', data: Buffer.from(document) },
      { name: 'word/_rels/document.xml.rels', data: Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`) },
      { name: 'word/styles.xml', data: Buffer.from(styles) },
    ]);
    const validation = await validateExport({ format: 'docx', buffer, renderFacts: {} });
    expect(validation.passed).toBe(false);
    expect(validation.issues.some((i) => i.code === 'docx.unknown-style')).toBe(true);
  });

  it('rejects a DOCX whose relationship target is not in the package', async () => {
    const buffer = buildZip([
      { name: '[Content_Types].xml', data: Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`) },
      { name: '_rels/.rels', data: Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`) },
      { name: 'word/document.xml', data: Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Hi</w:t></w:r></w:p></w:body></w:document>`) },
      { name: 'word/_rels/document.xml.rels', data: Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdImage" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/missing.webp"/></Relationships>`) },
    ]);
    const validation = await validateExport({ format: 'docx', buffer, renderFacts: {} });
    expect(validation.passed).toBe(false);
    expect(validation.issues.some((i) => i.code === 'docx.missing-target')).toBe(true);
  });

  it('rejects a file that is not a PDF', async () => {
    // The buffer is large enough to reach the format check rather than the size check.
    const validation = await validateExport({ format: 'pdf', buffer: Buffer.alloc(2048, 0x41), renderFacts: {} });
    expect(validation.passed).toBe(false);
    expect(validation.issues[0].code).toBe('pdf.not-a-pdf');
  });

  it('rejects a PDF that is too small to be a document', async () => {
    const validation = await validateExport({ format: 'pdf', buffer: Buffer.from('%PDF-1.4 tiny'), renderFacts: {} });
    expect(validation.passed).toBe(false);
    expect(validation.issues[0].code).toBe('pdf.too-small');
  });

  it('recognises an XML document whose elements are balanced', () => {
    expect(xmlWellFormed('<?xml version="1.0"?><a><b/></a>').ok).toBe(true);
    expect(xmlWellFormed('<?xml version="1.0"?><a><b></a>').ok).toBe(false);
  });
});
