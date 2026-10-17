/**
 * WHAT IN A CHAT ANSWER BELONGS IN THE WORK AREA (ΣΥΣΤΗΜΑ DESIGN §5,
 * «ΠΕΡΙΟΧΗ ΔΟΥΛΕΙΑΣ», Δ.2): «Όταν ένα εργαλείο παράγει κάτι, η οθόνη
 * χωρίζεται στα δύο».
 *
 * In Chat, "produced something" is an answer that is a thing to keep
 * rather than a reply to read: code, or a long document with structure.
 * Such an answer opens beside the conversation, where it can be read at
 * full width, copied and downloaded, and stays reachable from a small card
 * under the answer. A short reply stays a reply.
 *
 * Pure, so scripts/tests/chat-work-area.test.mjs can run it on real
 * shapes. The component is src/components/chat/work-area.tsx, behind the
 * switch "chat-work-area" (src/lib/flags/flags.ts).
 */

export type CodeBlock = { language: string | null; code: string };

export type WorkItem = {
  title: string;
  kind: "code" | "document";
  markdown: string;
  blocks: CodeBlock[];
  /** The download: one code block of a known language is saved as that
   *  file; anything else as the whole answer in Markdown. */
  fileName: string;
  fileBody: string;
};

/** Code this long, in any number of blocks, is a thing to keep. */
export const MIN_CODE_LINES = 8;
/** A document this long WITH a heading or a list is a thing to keep. */
export const MIN_DOCUMENT_CHARS = 1200;

const FENCE = /```([^\n`]*)\n([\s\S]*?)```/g;

export function codeBlocksIn(markdown: string): CodeBlock[] {
  const out: CodeBlock[] = [];
  for (const m of markdown.matchAll(FENCE)) {
    const language = m[1].trim() || null;
    out.push({ language, code: m[2].replace(/\n$/, "") });
  }
  return out;
}

const EXTENSIONS: Record<string, string> = {
  ts: "ts", typescript: "ts", tsx: "tsx", js: "js", javascript: "js", jsx: "jsx",
  py: "py", python: "py", html: "html", css: "css", json: "json", sql: "sql",
  sh: "sh", bash: "sh", shell: "sh", yaml: "yml", yml: "yml", go: "go", rust: "rs",
  java: "java", c: "c", cpp: "cpp", "c++": "cpp", csharp: "cs", cs: "cs", php: "php",
  ruby: "rb", rb: "rb", swift: "swift", kotlin: "kt", md: "md", markdown: "md",
};

export function titleOf(markdown: string): string {
  const heading = markdown.match(/^#{1,3}\s+(.+)$/m)?.[1];
  const firstLine = markdown.split("\n").map((l) => l.trim()).find((l) => l && !l.startsWith("```"));
  // The first heading, or else the first sentence: a name, never a cut
  // paragraph (a whole first line can be one).
  const raw = (heading ?? firstLine ?? "").replace(/[*_`#>]/g, "").trim();
  return heading ? raw : raw.split(/(?<=[.!?;·:])\s/)[0];
}

export function slug(text: string): string {
  const s = text
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return s || "ionexa";
}

export function workItemFrom(markdown: string): WorkItem | null {
  const text = markdown.trim();
  if (!text) return null;
  const blocks = codeBlocksIn(text);
  const codeLines = blocks.reduce((n, b) => n + b.code.split("\n").length, 0);
  const structured = /^#{1,3}\s/m.test(text) || /^\s*(?:[-*]|\d+\.)\s/m.test(text);
  const isCode = codeLines >= MIN_CODE_LINES;
  const isDocument = !isCode && text.length >= MIN_DOCUMENT_CHARS && structured;
  if (!isCode && !isDocument) return null;
  const title = titleOf(text);
  const base = slug(title);
  const ext = blocks.length === 1 && blocks[0].language ? EXTENSIONS[blocks[0].language.toLowerCase()] : undefined;
  return {
    title,
    kind: isCode ? "code" : "document",
    markdown: text,
    blocks,
    fileName: ext ? `${base}.${ext}` : `${base}.md`,
    fileBody: ext ? blocks[0].code : text,
  };
}
