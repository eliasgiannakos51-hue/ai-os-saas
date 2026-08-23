import { inflateRawSync } from "node:zlib";

/**
 * ENOUGH OF ZIP TO READ AN .XLSX, and no more.
 *
 * An .xlsx is a ZIP archive of XML files. Reading one therefore means
 * reading a ZIP, and the choice was between adding a dependency and
 * writing the ~120 lines below.
 *
 * WHY NOT A DEPENDENCY. The obvious one — SheetJS/`xlsx` — no longer
 * publishes to the npm registry, and the maintained alternatives pull in
 * a megabyte of writer code to do a read. More importantly, a
 * spreadsheet parser is a file format parser running on FILES STRANGERS
 * UPLOAD, which is the highest-risk dependency class there is. This does
 * one direction (read), one compression method (deflate, plus stored),
 * and refuses everything else rather than trying.
 *
 * WHAT IT DELIBERATELY DOES NOT SUPPORT, refused by name rather than
 * mis-read:
 *   - ZIP64 (archives over 4GB or with over 65,535 entries). An .xlsx
 *     that large is not a spreadsheet somebody wants charted.
 *   - Encrypted entries.
 *   - Compression methods other than 0 and 8.
 *
 * THE SIZES COME FROM THE CENTRAL DIRECTORY, not the local header. When
 * general-purpose bit 3 is set the local header's sizes are zeros and the
 * real ones follow the data — so a reader that trusts the local header
 * gets zero-length entries from every archive written by a streaming
 * writer, which includes several spreadsheet exporters.
 */

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;

/** A decompression bomb guard: 200MB out of a small archive is not a
 *  spreadsheet, it is an attack on the machine reading it. */
export const MAX_ENTRY_BYTES = 64 * 1024 * 1024;
export const MAX_ENTRIES = 512;

export type ZipEntry = { name: string; offset: number; compressedSize: number; size: number; method: number };
export type ZipError = { ok: false; reason: string };
export type ZipIndex = { ok: true; entries: Map<string, ZipEntry> };

export function readZipIndex(buffer: Buffer): ZipIndex | ZipError {
  const eocd = findEocd(buffer);
  if (eocd < 0) return { ok: false, reason: "not a zip archive" };

  const entryCount = buffer.readUInt16LE(eocd + 10);
  const directoryOffset = buffer.readUInt32LE(eocd + 16);

  if (entryCount === 0xffff || directoryOffset === 0xffffffff) {
    return { ok: false, reason: "ZIP64 archives are not supported" };
  }
  if (entryCount > MAX_ENTRIES) return { ok: false, reason: "too many entries" };
  if (directoryOffset >= buffer.length) return { ok: false, reason: "the central directory is out of range" };

  const entries = new Map<string, ZipEntry>();
  let cursor = directoryOffset;

  for (let i = 0; i < entryCount; i++) {
    if (cursor + 46 > buffer.length) return { ok: false, reason: "the central directory is truncated" };
    if (buffer.readUInt32LE(cursor) !== CENTRAL_SIGNATURE) {
      return { ok: false, reason: "the central directory is malformed" };
    }
    const flags = buffer.readUInt16LE(cursor + 8);
    // Bit 0 is the encryption flag. An encrypted entry decompresses to
    // noise, and noise parsed as XML is a confusing error a long way from
    // its cause.
    if (flags & 0x1) return { ok: false, reason: "the file is password protected" };

    const method = buffer.readUInt16LE(cursor + 10);
    const compressedSize = buffer.readUInt32LE(cursor + 20);
    const size = buffer.readUInt32LE(cursor + 24);
    const nameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    const localOffset = buffer.readUInt32LE(cursor + 42);
    const name = buffer.toString("utf8", cursor + 46, cursor + 46 + nameLength);

    entries.set(name, { name, offset: localOffset, compressedSize, size, method });
    cursor += 46 + nameLength + extraLength + commentLength;
  }

  return { ok: true, entries };
}

export function readZipEntry(buffer: Buffer, entry: ZipEntry): Buffer | null {
  if (entry.size > MAX_ENTRY_BYTES) return null;
  if (entry.offset + 30 > buffer.length) return null;
  if (buffer.readUInt32LE(entry.offset) !== LOCAL_SIGNATURE) return null;

  const nameLength = buffer.readUInt16LE(entry.offset + 26);
  const extraLength = buffer.readUInt16LE(entry.offset + 28);
  const start = entry.offset + 30 + nameLength + extraLength;
  const end = start + entry.compressedSize;
  if (end > buffer.length) return null;

  const data = buffer.subarray(start, end);
  if (entry.method === 0) return Buffer.from(data);
  if (entry.method !== 8) return null;

  try {
    // inflateRAW: a ZIP member is a bare deflate stream with no zlib
    // header. inflateSync would fail on every real archive.
    const out = inflateRawSync(data, { maxOutputLength: MAX_ENTRY_BYTES });
    return out;
  } catch {
    return null;
  }
}

function findEocd(buffer: Buffer): number {
  // The EOCD is at the end, but a trailing comment can push it up to
  // 65,535 bytes back — so it is searched for rather than assumed.
  const min = Math.max(0, buffer.length - 65_557);
  for (let i = buffer.length - 22; i >= min; i--) {
    if (buffer.readUInt32LE(i) === EOCD_SIGNATURE) return i;
  }
  return -1;
}
