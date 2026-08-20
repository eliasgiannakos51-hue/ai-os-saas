# fixtures/

## browser-print.pdf

A REAL PDF, produced by Chromium's own print-to-PDF, committed as bytes.

**It exists because every PDF fixture in this suite used to be written by
the suite.** `makeTestPdf` and the builder in `file-extraction.test.mjs`
both emit the simplest PDF that can exist: one uncompressed content
stream, one Type1 Helvetica, no font subsetting, no nested dictionaries.
The extractor read those perfectly and had never once been shown a file
anybody would actually upload — so `ai_cost_log` recorded zero successful
`file_ask` uses in the product's lifetime while the tests stayed green.

This file has what a real one has: Flate-compressed streams, subset
TrueType fonts (`AAAAAA+LiberationSans`), `/Encoding /Identity-H`, a
`/ToUnicode` CMap, and — the part that actually broke the extractor — a
`/Resources` dictionary with a nested `/ExtGState <<...>>` sitting before
`/Font`.

**Do not regenerate it to make a test pass.** Its value is that nobody
here chose its bytes. If the extractor stops reading it, the extractor
changed, not the fixture. To produce an equivalent one:

```js
const b = await chromium.launch();
const p = await b.newPage();
await p.setContent("<h1>Trading Strategy</h1>…");
await p.pdf({ path: "browser-print.pdf", format: "A4" });
```

Expected content: page 1 "Trading Strategy" + two sentences, page 2
"Page Two" + one sentence.

## multilingual.pdf, arabic-only.pdf, scanned-no-text-layer.pdf

Three more REAL PDFs, produced the same way and committed as bytes,
because "some PDFs are still rejected" came back a third time and the
suite had exactly one real file to test against.

- **multilingual.pdf** - Greek, Arabic (RTL) and Chinese in one document,
  plus a euro sign and combining accents. Every script in one file is the
  cheapest way to catch a decoder that silently drops one of them.
- **arabic-only.pdf** - a whole document in Arabic, headings included.
  The heading uses a different (bold) subset font from the body, which is
  what exposed the unmapped-glyph-id defect.
- **scanned-no-text-layer.pdf** - an image-only page, what a phone photo
  of a receipt looks like to a parser. It must be REFUSED, with the
  sentence that names OCR as the remedy.

Same rule as browser-print.pdf: do not regenerate them to make a test
pass.
