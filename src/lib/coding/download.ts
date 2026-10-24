/**
 * «ΛΗΨΗ» NEXT TO «ΑΝΤΙΓΡΑΦΗ» (the owner's critical message, 2026-10-22):
 * the same Blob-and-anchor trick every other download button in this
 * product already uses (dashboard/images, dashboard/documents' PDF),
 * applied to plain text instead of a binary file.
 */
const EXTENSION_FOR_LANGUAGE: Record<string, string> = {
  typescript: "ts", javascript: "js", python: "py", go: "go", rust: "rs",
  php: "php", sql: "sql", json: "json", bash: "sh", html: "html",
  css: "css", markdown: "md", yaml: "yml",
};

/** A sensible download name when the file has none of its own (a
 *  generated answer, a paste) — the detected language's own extension,
 *  or a bare ".txt" when nothing was detected. */
export function suggestedFileName(path: string | null, language: string | null): string {
  if (path) return path.split("/").pop() || "code.txt";
  const ext = (language && EXTENSION_FOR_LANGUAGE[language]) || "txt";
  return `code.${ext}`;
}

export function downloadTextFile(content: string, fileName: string): void {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  // Deferred: Safari has dropped a revoke called in the same tick before
  // the click's own navigation reads the URL.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** Bundle multiple text files into a .zip and trigger a download.
 *  Uses the bare ZIP format (local headers + central directory) so no
 *  external library is needed — fine for the small text files this tool
 *  produces. Store-only (no compression), which keeps the code tiny and
 *  works in every browser. */
export function downloadZip(
  files: { path: string; content: string }[],
  zipName: string,
): void {
  const enc = new TextEncoder();
  const entries: { name: Uint8Array; data: Uint8Array; offset: number }[] = [];
  const parts: Uint8Array[] = [];
  let offset = 0;

  for (const f of files) {
    const name = enc.encode(f.path);
    const data = enc.encode(f.content);
    const localHeader = new Uint8Array(30 + name.length);
    const view = new DataView(localHeader.buffer);
    view.setUint32(0, 0x04034b50, true);   // local file header signature
    view.setUint16(4, 20, true);            // version needed
    view.setUint16(6, 0x0800, true);        // general purpose bit flag (UTF-8)
    view.setUint16(8, 0, true);             // compression: store
    view.setUint16(10, 0, true);            // mod time
    view.setUint16(12, 0, true);            // mod date
    view.setUint32(14, crc32(data), true);  // crc-32
    view.setUint32(18, data.length, true);  // compressed size
    view.setUint32(22, data.length, true);  // uncompressed size
    view.setUint16(26, name.length, true);  // file name length
    view.setUint16(28, 0, true);            // extra field length
    localHeader.set(name, 30);

    entries.push({ name, data, offset });
    parts.push(localHeader, data);
    offset += localHeader.length + data.length;
  }

  const cdStart = offset;
  for (const e of entries) {
    const cdEntry = new Uint8Array(46 + e.name.length);
    const v = new DataView(cdEntry.buffer);
    v.setUint32(0, 0x02014b50, true);      // central directory header signature
    v.setUint16(4, 20, true);              // version made by
    v.setUint16(6, 20, true);              // version needed
    v.setUint16(8, 0x0800, true);          // general purpose bit flag (UTF-8)
    v.setUint16(10, 0, true);              // compression: store
    v.setUint16(12, 0, true);              // mod time
    v.setUint16(14, 0, true);              // mod date
    v.setUint32(16, crc32(e.data), true);  // crc-32
    v.setUint32(20, e.data.length, true);  // compressed size
    v.setUint32(24, e.data.length, true);  // uncompressed size
    v.setUint16(28, e.name.length, true);  // file name length
    v.setUint16(30, 0, true);              // extra field length
    v.setUint16(32, 0, true);              // file comment length
    v.setUint16(34, 0, true);              // disk number start
    v.setUint16(36, 0, true);              // internal file attributes
    v.setUint32(38, 0, true);              // external file attributes
    v.setUint32(42, e.offset, true);       // relative offset of local header
    cdEntry.set(e.name, 46);
    parts.push(cdEntry);
    offset += cdEntry.length;
  }

  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);         // end of central directory signature
  ev.setUint16(4, 0, true);                  // disk number
  ev.setUint16(6, 0, true);                  // disk with CD
  ev.setUint16(8, entries.length, true);      // entries on this disk
  ev.setUint16(10, entries.length, true);     // total entries
  ev.setUint32(12, offset - cdStart, true);   // size of central directory
  ev.setUint32(16, cdStart, true);            // offset of CD
  ev.setUint16(20, 0, true);                 // comment length
  parts.push(eocd);

  const blob = new Blob(parts as BlobPart[], { type: "application/zip" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = zipName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) crc = CRC_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
