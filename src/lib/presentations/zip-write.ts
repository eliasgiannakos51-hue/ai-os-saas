import "server-only";
import { deflateRawSync } from "node:zlib";

/**
 * A minimal ZIP writer.
 *
 * Written rather than depended on for the same reason lib/files/zip.ts
 * reads them by hand: a .pptx is a ZIP, and the alternative is pulling a
 * general-purpose archive library into a process that holds a
 * service-role key in order to use about 3% of it. This writes exactly
 * one shape of archive — no directories, no encryption, no zip64, no
 * multi-disk — and refuses anything outside it.
 *
 * The counterpart to lib/files/zip.ts's reader, kept separate because
 * they have opposite threat models. The READER takes bytes from
 * strangers and its job is to survive a zip bomb. The WRITER takes bytes
 * we generated and its job is to produce a file PowerPoint will open —
 * where the risk is not attack but silent malformation, which is why the
 * offsets and CRCs below are pinned by tests instead of eyeballed.
 */

// Zip stores the DOS date/time of each entry. Real archivers write "now",
// which would make every export of the same deck a different file — and
// a test that cannot compare two runs byte for byte cannot tell a
// deterministic writer from a lucky one. Pinned to 1980-01-01, the
// earliest DOS timestamp: no metadata about when a user exported, and a
// build gate that can diff.
const DOS_TIME = 0;
const DOS_DATE = 0x21; // 1980-01-01

export type ZipInput = { name: string; data: Buffer };

// CRC-32 (IEEE), table built once on first use. Not from node:zlib —
// zlib.crc32 only landed in Node 20.15/22.2 and this file has to work on
// whatever the deployment pins (package.json says 22.x; a runtime that
// silently lacked it would produce archives with zeroed CRCs, which some
// readers accept and PowerPoint does not).
let CRC_TABLE: Uint32Array | null = null;

function crcTable(): Uint32Array {
  if (CRC_TABLE) return CRC_TABLE;
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  CRC_TABLE = table;
  return table;
}

export function crc32(buf: Buffer): number {
  const table = crcTable();
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = table[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/**
 * Build a ZIP archive from a list of entries.
 *
 * Every entry is deflated, except when deflating makes it bigger — which
 * happens for the short XML parts and for already-compressed JPEG/PNG
 * media. Those are STORED instead. This is not an optimisation: a
 * "compressed" entry larger than its input is what makes some strict
 * readers reject an archive.
 */
export function createZip(entries: ZipInput[]): Buffer {
  const locals: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBuf = Buffer.from(entry.name, "utf8");
    const crc = crc32(entry.data);

    const deflated = deflateRawSync(entry.data, { level: 9 });
    const useDeflate = deflated.length < entry.data.length;
    const stored = useDeflate ? deflated : entry.data;
    const method = useDeflate ? 8 : 0;

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0); // local file header signature
    localHeader.writeUInt16LE(20, 4); // version needed (2.0 — deflate)
    localHeader.writeUInt16LE(0, 6); // flags: none. No data descriptor,
    // because sizes are known before writing.
    localHeader.writeUInt16LE(method, 8);
    localHeader.writeUInt16LE(DOS_TIME, 10);
    localHeader.writeUInt16LE(DOS_DATE, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(stored.length, 18);
    localHeader.writeUInt32LE(entry.data.length, 22);
    localHeader.writeUInt16LE(nameBuf.length, 26);
    localHeader.writeUInt16LE(0, 28); // extra field length

    locals.push(localHeader, nameBuf, stored);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0); // central directory signature
    centralHeader.writeUInt16LE(20, 4); // version made by
    centralHeader.writeUInt16LE(20, 6); // version needed
    centralHeader.writeUInt16LE(0, 8); // flags
    centralHeader.writeUInt16LE(method, 10);
    centralHeader.writeUInt16LE(DOS_TIME, 12);
    centralHeader.writeUInt16LE(DOS_DATE, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(stored.length, 20);
    centralHeader.writeUInt32LE(entry.data.length, 24);
    centralHeader.writeUInt16LE(nameBuf.length, 28);
    centralHeader.writeUInt16LE(0, 30); // extra
    centralHeader.writeUInt16LE(0, 32); // comment
    centralHeader.writeUInt16LE(0, 34); // disk number
    centralHeader.writeUInt16LE(0, 36); // internal attributes
    centralHeader.writeUInt32LE(0, 38); // external attributes
    centralHeader.writeUInt32LE(offset, 42); // offset of local header

    central.push(centralHeader, nameBuf);

    offset += localHeader.length + nameBuf.length + stored.length;
  }

  const centralBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); // end of central directory
  end.writeUInt16LE(0, 4); // this disk
  end.writeUInt16LE(0, 6); // disk with central directory
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20); // comment length

  return Buffer.concat([...locals, centralBuf, end]);
}
