import { describe, expect, it } from 'vitest';
import { exportOptionsSchema, exportRequestSchema, EXPORT_FORMATS } from '@ebook/shared';
import { buildZip, crc32, readZip, zipEntry, ZipError } from '../src/services/exports/zip.js';
import { xmlWellFormed } from '../src/services/exports/validators.js';
import { contentHash, stableStringify } from '../src/services/exports/hash.js';

/**
 * S10 deterministic checks: the ZIP container, the XML well-formedness check,
 * the export option contract and the content hash. These need no database.
 */

describe('zip container', () => {
  it('round-trips stored and deflated entries', () => {
    const big = Buffer.from('x'.repeat(5000));
    const buffer = buildZip([
      { name: 'mimetype', data: Buffer.from('application/epub+zip'), store: true },
      { name: 'stored.txt', data: Buffer.from('hello'), store: true },
      { name: 'deflated.txt', data: big },
    ]);
    const entries = readZip(buffer);
    expect(entries.map((e) => e.name)).toEqual(['mimetype', 'stored.txt', 'deflated.txt']);
    // The mimetype entry must be stored, not deflated: the EPUB spec requires it.
    expect(entries[0].deflated).toBe(false);
    expect(entries[1].deflated).toBe(false);
    expect(entries[2].deflated).toBe(true);
    expect(entries[2].data.toString()).toBe(big.toString());
    expect(zipEntry(entries, 'stored.txt')?.data.toString()).toBe('hello');
    expect(zipEntry(entries, 'missing.txt')).toBeUndefined();
  });

  it('writes the mimetype entry first and uncompressed', () => {
    const buffer = buildZip([
      { name: 'mimetype', data: Buffer.from('application/epub+zip'), store: true },
      { name: 'other.txt', data: Buffer.from('x') },
    ]);
    expect(buffer.subarray(0, 4).readUInt32LE(0)).toBe(0x04034b50);
    expect(buffer.subarray(30, 38).toString('utf8')).toBe('mimetype');
    // The stored method code must be 0, not 8.
    expect(buffer.readUInt16LE(8)).toBe(0);
  });

  it('rejects a corrupted archive instead of guessing', () => {
    const buffer = buildZip([{ name: 'a.txt', data: Buffer.from('hello') }]);
    const corrupted = Buffer.from(buffer);
    // Corrupt the stored payload so the checksum no longer matches.
    corrupted[40] = corrupted[40] ^ 0xff;
    expect(() => readZip(corrupted)).toThrow(ZipError);
    expect(() => readZip(Buffer.from('not a zip at all'))).toThrow(ZipError);
    expect(() => readZip(Buffer.alloc(4))).toThrow(ZipError);
  });

  it('computes the standard CRC-32', () => {
    expect(crc32(Buffer.from('123456789'))).toBe(0xcbf43926);
    expect(crc32(Buffer.alloc(0))).toBe(0);
  });
});

describe('xml well-formedness', () => {
  it('accepts a well-formed document', () => {
    expect(xmlWellFormed('<?xml version="1.0"?><a><b x="1"/></a>').ok).toBe(true);
    expect(xmlWellFormed('<a><b>text</b></a>').ok).toBe(true);
  });

  it('rejects unbalanced, unescaped and control-character documents', () => {
    expect(xmlWellFormed('<a><b></a>').ok).toBe(false);
    expect(xmlWellFormed('<a>').ok).toBe(false);
    expect(xmlWellFormed('  ').ok).toBe(false);
    expect(xmlWellFormed('<a>1 < 2</a>').ok).toBe(false);
    // 0x0B (vertical tab) is not permitted in XML 1.0 content.
    expect(xmlWellFormed(`<a>${String.fromCharCode(0x0b)}</a>`).ok).toBe(false);
    // Tab, newline and carriage return are permitted in XML content.
    expect(xmlWellFormed(`<a>x${String.fromCharCode(9)}y</a>`).ok).toBe(true);
  });
});

describe('export options', () => {
  it('applies each format’s defaults', () => {
    const pdf = exportOptionsSchema.parse({ format: 'pdf' });
    expect(pdf.options).toEqual({ layout: 'print', includeMatter: true, includeToc: true });
    const epub = exportOptionsSchema.parse({ format: 'epub' });
    expect(epub.options).toEqual({ includeMatter: true, includeCover: true, fontScale: 1 });
    const docx = exportOptionsSchema.parse({ format: 'docx' });
    expect(docx.options).toEqual({ includeMatter: true, fontSizePt: 11, repeatTableHeaders: true });
  });

  it('rejects options that belong to another format', () => {
    // An EPUB option sent for a PDF export is a mistake, not a silent default.
    expect(exportOptionsSchema.safeParse({ format: 'pdf', options: { fontScale: 1.2 } }).success).toBe(false);
    expect(exportOptionsSchema.safeParse({ format: 'epub', options: { layout: 'print' } }).success).toBe(false);
    expect(exportOptionsSchema.safeParse({ format: 'pdf', options: { layout: 'huge' } }).success).toBe(false);
    expect(exportOptionsSchema.safeParse({ format: 'docx', options: { fontSizePt: 40 } }).success).toBe(false);
  });

  it('accepts partial request options and rejects unknown ones', () => {
    expect(exportRequestSchema.safeParse({ format: 'pdf', options: { layout: 'digital' } }).success).toBe(true);
    expect(exportRequestSchema.safeParse({ format: 'pdf', options: { layout: 'digital', unknown: 1 } }).success).toBe(false);
    expect(exportRequestSchema.safeParse({ format: 'docx', options: { fontSizePt: 12 } }).success).toBe(true);
    expect(EXPORT_FORMATS).toEqual(['pdf', 'epub', 'docx']);
  });
});

describe('content hash', () => {
  it('is stable for equal content and changes with the content', () => {
    const a = contentHash([{ id: 'c1', version: 2, content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hi' }] }] } }]);
    const b = contentHash([{ id: 'c1', version: 2, content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hi' }] }] } }]);
    const c = contentHash([{ id: 'c1', version: 2, content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hi!' }] }] } }]);
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  it('ignores key order so an equivalent document hashes the same', () => {
    expect(stableStringify({ b: 1, a: 2 })).toBe(stableStringify({ a: 2, b: 1 }));
    expect(stableStringify({ a: [1, { d: 4, c: 3 }] })).toBe(stableStringify({ a: [1, { c: 3, d: 4 }] }));
  });
});
