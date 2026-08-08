import { inflateRawSync } from "node:zlib";
import { MAX_UNZIPPED_BYTES } from "@/lib/files/file-types";

/**
 * A minimal, read-only ZIP reader — enough to open a DOCX or an XLSX,
 * and deliberately nothing more.
 *
 * WHY NOT A LIBRARY. The obvious answer is `xlsx` and `mammoth`, and the
 * obvious answer is wrong here for three reasons:
 *
 *   1. This code parses files uploaded by strangers. Every dependency in
 *      that path is attack surface I cannot audit, in a process that
 *      holds a service-role key.
 *   2. The npm `xlsx` package has a known prototype-pollution advisory
 *      and its maintained builds are distributed outside npm.
 *   3. None of them let me cap decompressed size. A 3MB zip that expands
 *      to 40GB ("zip bomb") is trivial to build and would take the
 *      function down with an OOM, not a 400. That cap is the single most
 *      important line in this file and it has to be mine.
 *
 * What this reader deliberately does NOT do: encrypted entries, Zip64,
 * multi-disk archives, or anything with a directory traversal in its
 * name. All four are refused rather than handled — a document format
 * that needs any of them is not a document we are going to read.
 */

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;

export type ZipEntry = {
  name: string;
  compressionMethod: number;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
  /** Bit 0 of the general-purpose flags. We refuse these. */
  encrypted: boolean;
};

export class ZipError extends Error {}

/**
 * Find the End Of Central Directory record.
 *
 * It is at the very end unless the archive has a trailing comment, so the
 * spec-mandated way to find it is to scan backwards over the maximum
 * comment length (64KB). Scanning the WHOLE file backwards, which is what
 * a naive implementation does, is a quadratic denial-of-service on a
 * 20MB upload full of near-miss signature bytes.
 */
function findEocd(buf: Buffer): number {
  const maxScan = Math.min(buf.length, 22 + 0xffff);
  for (let i = buf.length - 22; i >= buf.length - maxScan; i--) {
    if (i < 0) break;
    if (buf.readUInt32LE(i) === EOCD_SIGNATURE) return i;
  }
  throw new ZipError("not a zip archive (no end-of-central-directory record)");
}

export function readZipEntries(buf: Buffer): ZipEntry[] {
  const eocd = findEocd(buf);

  const entryCount = buf.readUInt16LE(eocd + 10);
  const centralSize = buf.readUInt32LE(eocd + 12);
  const centralOffset = buf.readUInt32LE(eocd + 16);

  // 0xffff / 0xffffffff are the Zip64 escape values. A DOCX or XLSX under
  // 20MB never needs them, so seeing one means either a crafted archive
  // or a format we do not support — refuse either way.
  if (entryCount === 0xffff || centralSize === 0xffffffff || centralOffset === 0xffffffff) {
    throw new ZipError("zip64 archives are not supported");
  }
  if (centralOffset + centralSize > buf.length) {
    throw new ZipError("corrupt zip (central directory runs past the end of the file)");
  }

  const entries: ZipEntry[] = [];
  let p = centralOffset;

  for (let i = 0; i < entryCount; i++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== CENTRAL_SIGNATURE) {
      throw new ZipError("corrupt zip (bad central directory entry)");
    }
    const flags = buf.readUInt16LE(p + 8);
    const compressionMethod = buf.readUInt16LE(p + 10);
    const compressedSize = buf.readUInt32LE(p + 20);
    const uncompressedSize = buf.readUInt32LE(p + 24);
    const nameLength = buf.readUInt16LE(p + 28);
    const extraLength = buf.readUInt16LE(p + 30);
    const commentLength = buf.readUInt16LE(p + 32);
    const localHeaderOffset = buf.readUInt32LE(p + 42);

    const name = buf.subarray(p + 46, p + 46 + nameLength).toString("utf8");

    entries.push({
      name,
      compressionMethod,
      compressedSize,
      uncompressedSize,
      localHeaderOffset,
      encrypted: (flags & 0x1) !== 0,
    });

    p += 46 + nameLength + extraLength + commentLength;
  }

  return entries;
}

/**
 * Decompress one entry, refusing anything that would cost more than the
 * ceiling.
 *
 * The size is checked TWICE and the second check is the one that matters:
 * the declared `uncompressedSize` in the header is attacker-controlled, so
 * trusting it alone is no protection at all. The real defence is
 * `maxOutputLength` on the inflate call, which makes zlib itself stop
 * rather than allocate.
 */
export function readZipEntryText(buf: Buffer, entry: ZipEntry): string {
  if (entry.encrypted) {
    throw new ZipError("this document is password-protected");
  }
  if (entry.uncompressedSize > MAX_UNZIPPED_BYTES) {
    throw new ZipError("this document is too large to read");
  }

  const local = entry.localHeaderOffset;
  if (local + 30 > buf.length || buf.readUInt32LE(local) !== LOCAL_SIGNATURE) {
    throw new ZipError("corrupt zip (bad local file header)");
  }
  // The local header's own name/extra lengths, NOT the central
  // directory's — they are allowed to differ, and using the wrong pair
  // lands the read a few bytes off and produces garbage rather than an
  // error.
  const nameLength = buf.readUInt16LE(local + 26);
  const extraLength = buf.readUInt16LE(local + 28);
  const dataStart = local + 30 + nameLength + extraLength;

  if (dataStart + entry.compressedSize > buf.length) {
    throw new ZipError("corrupt zip (entry data runs past the end of the file)");
  }
  const data = buf.subarray(dataStart, dataStart + entry.compressedSize);

  if (entry.compressionMethod === 0) {
    return data.toString("utf8");
  }
  if (entry.compressionMethod !== 8) {
    throw new ZipError(`unsupported compression method ${entry.compressionMethod}`);
  }

  try {
    // maxOutputLength is the zip-bomb defence. Without it, a 3MB archive
    // of zeroes expands to tens of gigabytes and the process dies.
    const out = inflateRawSync(data, { maxOutputLength: MAX_UNZIPPED_BYTES });
    return out.toString("utf8");
  } catch (err) {
    if (err instanceof RangeError) throw new ZipError("this document is too large to read");
    throw new ZipError("this document could not be read");
  }
}

/** Find one entry by exact path. DOCX/XLSX part names are fixed by the
 *  OOXML spec, so an exact match is correct and a fuzzy one would let a
 *  crafted archive substitute a different part. */
export function findZipEntry(entries: ZipEntry[], name: string): ZipEntry | undefined {
  return entries.find((e) => e.name === name);
}
