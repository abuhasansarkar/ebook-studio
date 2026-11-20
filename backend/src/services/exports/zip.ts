import { deflateRawSync, inflateRawSync } from 'node:zlib';

/**
 * Minimal ZIP reader/writer for the EPUB and DOCX containers.
 *
 * EPUB and DOCX are ZIP archives with a strict subset of the format, so this
 * implements exactly that subset: local file headers, the central directory and
 * the end-of-central-directory record. Stored (uncompressed) and deflated
 * entries are supported; ZIP64, encryption and data descriptors are not, and
 * are rejected rather than silently mis-read.
 *
 * The reader is used by the export validators, which must inspect the file that
 * was actually written to storage rather than the in-memory buffer.
 */

const LOCAL_SIGNATURE = 0x04034b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const EOCD_SIGNATURE = 0x06054b50;
const EOCD_SIZE = 22;
const ZIP64_EOCD_LOCATOR = 0x07064b50;

export interface ZipEntry {
  /** Path inside the archive, always with forward slashes. */
  name: string;
  data: Buffer;
  /** True when the entry was written with deflate compression. */
  deflated: boolean;
}

export interface ZipWriteEntry {
  name: string;
  data: Buffer;
  /** Store without compression. Useful for already-compressed payloads. */
  store?: boolean;
}

/** CRC-32 (IEEE), used by the ZIP format. */
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
})();

export function crc32(data: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) crc = CRC_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/** DOS date/time from a JS date. */
function dosDateTime(date: Date) {
  const year = Math.max(1980, date.getUTCFullYear());
  const time = (date.getUTCHours() << 11) | (date.getUTCMinutes() << 5) | (Math.floor(date.getUTCSeconds() / 2));
  const day = ((year - 1980) << 9) | ((date.getUTCMonth() + 1) << 5) | date.getUTCDate();
  return { time, day };
}

/**
 * Builds a ZIP archive.
 *
 * The `mimetype` entry is written first and stored uncompressed when it is
 * present, because the EPUB specification requires exactly that.
 */
export function buildZip(entries: ZipWriteEntry[], date = new Date()): Buffer {
  const { time, day } = dosDateTime(date);
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8');
    const raw = entry.data;
    const store = entry.store === true || raw.length === 0;
    const compressed = store ? raw : deflateRawSync(raw, { level: 9 });
    const crc = crc32(raw);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(LOCAL_SIGNATURE, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0, 6); // flags
    local.writeUInt16LE(store ? 0 : 8, 8); // method
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(day, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28); // extra length
    locals.push(local, name, compressed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(CENTRAL_SIGNATURE, 0);
    central.writeUInt16LE(20, 4); // version made by
    central.writeUInt16LE(20, 6); // version needed
    central.writeUInt16LE(0, 8); // flags
    central.writeUInt16LE(store ? 0 : 8, 10); // method
    central.writeUInt16LE(time, 12);
    central.writeUInt16LE(day, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30); // extra length
    central.writeUInt16LE(0, 32); // comment length
    central.writeUInt16LE(0, 34); // disk number
    central.writeUInt16LE(0, 36); // internal attributes
    // Unix mode 0644 in the high 16 bits; `>>> 0` keeps the value unsigned.
    central.writeUInt32LE((0o100644 << 16) >>> 0, 38); // external attributes: regular file
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);

    offset += local.length + name.length + compressed.length;
  }

  const centralDirectory = Buffer.concat(centrals);
  const eocd = Buffer.alloc(EOCD_SIZE);
  eocd.writeUInt32LE(EOCD_SIGNATURE, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralDirectory.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...locals, centralDirectory, eocd]);
}

export class ZipError extends Error {}

/**
 * Reads a ZIP archive. Throws `ZipError` for anything outside the supported
 * subset so a validator reports a missing or damaged file instead of guessing.
 */
export function readZip(buffer: Buffer): ZipEntry[] {
  if (buffer.length < EOCD_SIZE) throw new ZipError('File is too small to be a ZIP archive');
  // The end-of-central-directory record is at the end, but a comment may follow it.
  let eocdAt = -1;
  const searchFrom = Math.max(0, buffer.length - EOCD_SIZE - 0xffff);
  for (let i = buffer.length - EOCD_SIZE; i >= searchFrom; i--) {
    if (buffer.readUInt32LE(i) === EOCD_SIGNATURE) { eocdAt = i; break; }
  }
  if (eocdAt < 0) throw new ZipError('No ZIP end-of-central-directory record found');
  if (eocdAt >= 20 && buffer.readUInt32LE(eocdAt - 20) === ZIP64_EOCD_LOCATOR) throw new ZipError('ZIP64 archives are not supported');

  const count = buffer.readUInt16LE(eocdAt + 10);
  const directorySize = buffer.readUInt32LE(eocdAt + 12);
  const directoryAt = buffer.readUInt32LE(eocdAt + 16);
  if (directoryAt + directorySize > buffer.length) throw new ZipError('ZIP central directory is truncated');

  const entries: ZipEntry[] = [];
  let cursor = directoryAt;
  for (let i = 0; i < count; i++) {
    if (cursor + 46 > buffer.length) throw new ZipError('ZIP central directory is truncated');
    if (buffer.readUInt32LE(cursor) !== CENTRAL_SIGNATURE) throw new ZipError('Corrupt ZIP central directory');
    const method = buffer.readUInt16LE(cursor + 10);
    const crc = buffer.readUInt32LE(cursor + 16);
    const compressedSize = buffer.readUInt32LE(cursor + 20);
    const rawSize = buffer.readUInt32LE(cursor + 24);
    const nameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    const localAt = buffer.readUInt32LE(cursor + 42);
    const name = buffer.toString('utf8', cursor + 46, cursor + 46 + nameLength);
    cursor += 46 + nameLength + extraLength + commentLength;

    if (localAt + 30 > buffer.length) throw new ZipError(`Corrupt ZIP entry "${name}"`);
    if (buffer.readUInt32LE(localAt) !== LOCAL_SIGNATURE) throw new ZipError(`Corrupt ZIP entry "${name}"`);
    const localNameLength = buffer.readUInt16LE(localAt + 26);
    const localExtraLength = buffer.readUInt16LE(localAt + 28);
    const dataAt = localAt + 30 + localNameLength + localExtraLength;
    if (dataAt + compressedSize > buffer.length) throw new ZipError(`Truncated ZIP entry "${name}"`);
    const payload = buffer.subarray(dataAt, dataAt + compressedSize);

    let data: Buffer;
    if (method === 0) data = Buffer.from(payload);
    else if (method === 8) {
      try {
        data = inflateRawSync(payload);
      } catch {
        // A damaged deflate stream must be reported as a ZIP error, not a raw zlib error.
        throw new ZipError(`Corrupt compressed data in ZIP entry "${name}"`);
      }
    } else throw new ZipError(`Unsupported ZIP compression method ${method} in "${name}"`);
    if (data.length !== rawSize) throw new ZipError(`Size mismatch in ZIP entry "${name}"`);
    if (crc32(data) !== crc) throw new ZipError(`Checksum mismatch in ZIP entry "${name}"`);
    entries.push({ name, data, deflated: method === 8 });
  }
  return entries;
}

/** One entry by name, or undefined when the archive does not contain it. */
export function zipEntry(entries: ZipEntry[], name: string): ZipEntry | undefined {
  return entries.find((e) => e.name === name);
}
