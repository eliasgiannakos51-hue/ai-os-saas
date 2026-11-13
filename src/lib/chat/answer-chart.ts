import type { SlideChart } from "@/lib/presentations/deck";

/**
 * A CHART CARRIED INSIDE A CHAT ANSWER (the owner's «30. CHAT:
 * ΓΡΑΦΗΜΑΤΑ, ΔΙΑΓΡΑΜΜΑΤΑ ΚΑΙ ΚΑΡΤΕΣ ΜΕΣΑ ΣΤΗΝ ΑΠΑΝΤΗΣΗ», 2026-10-31),
 * Κομμάτι 1: «Οι αριθμοί υπολογίζονται με κώδικα, ποτέ από το μοντέλο.»
 *
 * THE SHAPE IS SlideChart, NOT A NEW TYPE. lib/presentations/deck.ts
 * already carries exactly what a code-computed chart needs — kind,
 * points, and a `source` naming the file, the columns and the arithmetic
 * — and lib/presentations/deck-charts.ts already computes it from a
 * data_analyses row with the same rule this piece needs: the model is
 * never shown a row and never returns a number that gets drawn. Chat
 * Κομμάτι 1 goes further than Slides does — the ROUTE picks the chart
 * (src/app/api/chat/route.ts, the first one the file's own columns
 * allow), not the model, which is the simplest rule that cannot be
 * gamed: nothing the model writes decides which chart appears or what
 * its numbers are.
 *
 * WHERE IT IS KEPT. Inside the message itself, as a markdown link
 * REFERENCE DEFINITION appended after the answer (and after the numbered
 * sources, if any) — the exact mechanism lib/chat/web-sources.ts already
 * uses for its own invisible carrier (`[n]: <url> "title"`), not an HTML
 * comment: a first version of this file used `<!--ionexa-chart:…-->`,
 * and scripts/tests/chat-chart.test.mjs's own render check caught that
 * react-markdown, with no rehype-raw (components/chat/message-content.tsx
 * sets remarkGfm only), does NOT drop raw HTML — it escapes it to
 * visible text (`&lt;!--…--&gt;`). A reference definition is different:
 * CommonMark removes it from the document entirely, producing no node at
 * all, which is what the test actually proved once pointed at the real
 * mechanism. The definition's "destination" is an empty `<>` (chart data
 * has no URL of its own); its "title" carries the payload.
 *
 * Base64 rather than raw JSON: a point's label is a value from the
 * person's own spreadsheet, so it can contain anything, including a
 * literal quote mark that would otherwise end the title early. The
 * base64 alphabet contains none of markdown's special characters — no
 * quote, backslash or newline — so nothing inside it can break the
 * carrier or leak through as visible text.
 */

const LABEL = "ionexa-chart";
const CARRIER = new RegExp(`^\\[${LABEL}\\]: <>\\s*"([A-Za-z0-9+/=]*)"\\s*$`, "m");

/**
 * UTF-8-safe base64, in both environments this module runs in: the
 * server (route.ts, Node — Buffer) and the client (answer-chart.tsx,
 * the browser — btoa/atob, which only handle Latin-1 byte strings on
 * their own, hence the encodeURIComponent/escape dance around them).
 */
function toBase64(input: string): string {
  if (typeof Buffer !== "undefined") return Buffer.from(input, "utf8").toString("base64");
  return btoa(unescape(encodeURIComponent(input)));
}
function fromBase64(input: string): string {
  if (typeof Buffer !== "undefined") return Buffer.from(input, "base64").toString("utf8");
  return decodeURIComponent(escape(atob(input)));
}

function isSlideChart(value: unknown): value is SlideChart {
  if (!value || typeof value !== "object") return false;
  const c = value as Record<string, unknown>;
  if (c.kind !== "bar" && c.kind !== "line" && c.kind !== "pie") return false;
  if (typeof c.title !== "string" || !c.title.trim()) return false;
  if (!Array.isArray(c.points) || c.points.length === 0) return false;
  for (const p of c.points) {
    if (!p || typeof p !== "object") return false;
    const point = p as Record<string, unknown>;
    if (typeof point.label !== "string") return false;
    if (typeof point.value !== "number" || !Number.isFinite(point.value)) return false;
  }
  const src = c.source as Record<string, unknown> | undefined;
  if (!src || typeof src !== "object") return false;
  if (typeof src.dataId !== "string" || !src.dataId) return false;
  if (typeof src.file !== "string") return false;
  if (typeof src.x !== "string") return false;
  if (src.y !== null && typeof src.y !== "string") return false;
  if (typeof src.aggregation !== "string") return false;
  if (typeof src.rows !== "number" || !Number.isFinite(src.rows)) return false;
  return true;
}

/**
 * Folds a chart into the answer's stored text, or returns the text
 * unchanged when there is none — the common case, since most answers
 * carry no attached dataset at all.
 */
export function attachAnswerChart(text: string, chart: SlideChart | null): string {
  if (!chart) return text;
  const encoded = toBase64(JSON.stringify(chart));
  return `${text.replace(/\s+$/, "")}\n\n[${LABEL}]: <> "${encoded}"\n`;
}

/** The chart a stored or streamed answer carries, or null. Never throws
 *  on a malformed or hand-edited row — the same defensive shape every
 *  other parser of stored content in this app uses. */
export function parseAnswerChart(content: string): SlideChart | null {
  const match = String(content ?? "").match(CARRIER);
  if (!match) return null;
  try {
    const parsed: unknown = JSON.parse(fromBase64(match[1]));
    return isSlideChart(parsed) ? parsed : null;
  } catch {
    return null;
  }
}
