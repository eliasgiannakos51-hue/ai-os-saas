// A real, minimal PDF writer: one Helvetica text line per page, optionally
// compressed or flagged encrypted. Shared by file-extraction.test.mjs and
// file-pages.itest.mjs (a 51-page document), so the PDF a test reads is
// written one way.
import { deflateSync } from "node:zlib";

/** pages: [string] — one content stream body per page. */
export function buildPdf(pageTexts, { compress = false, encrypted = false } = {}) {
  const objects = [];
  const push = (body) => {
    objects.push(body);
    return objects.length; // 1-based object number
  };

  // 1: catalog, 2: pages — reserved so the kids can point back.
  objects.push("", "");

  const pageNumbers = [];
  for (const text of pageTexts) {
    const streamBody = `BT /F1 12 Tf 72 720 Td (${text}) Tj ET`;
    const raw = Buffer.from(streamBody, "latin1");
    const data = compress ? deflateSync(raw) : raw;
    const filter = compress ? "/Filter /FlateDecode " : "";
    const contentNum = push(
      `<< ${filter}/Length ${data.length} >>\nstream\n${data.toString("latin1")}\nendstream`
    );
    const pageNum = push(
      `<< /Type /Page /Parent 2 0 R /Contents ${contentNum} 0 R /Resources << /Font << /F1 ${objects.length + 2} 0 R >> >> >>`
    );
    pageNumbers.push(pageNum);
    push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  }

  objects[0] = `<< /Type /Catalog /Pages 2 0 R >>`;
  objects[1] = `<< /Type /Pages /Kids [${pageNumbers.map((n) => `${n} 0 R`).join(" ")}] /Count ${pageNumbers.length} >>`;

  let out = "%PDF-1.4\n";
  const offsets = [0];
  for (let i = 0; i < objects.length; i++) {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
  }
  const xrefAt = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objects.length; i++) {
    out += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  const encryptRef = encrypted ? ` /Encrypt ${objects.length + 1} 0 R` : "";
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R${encryptRef} >>\nstartxref\n${xrefAt}\n%%EOF\n`;

  return Buffer.from(out, "latin1");
}
