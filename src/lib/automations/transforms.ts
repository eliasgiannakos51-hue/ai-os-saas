/**
 * THE DATA BOXES THAT REALLY CHANGE THE TEXT (2026-11-27): limit, sort,
 * remove_duplicates, set. What flows between boxes in lib/automations/runner.ts
 * is text, one item per line, so each of these works on lines. They used to
 * pass the text through and report "ok", which made a flow containing them
 * look like it had done their work. The runner calls this only while the
 * switch "automation-real-logic" is open (runner.ts, runFlow).
 *
 * Pure on purpose: no database, no model, no clock — scripts/tests/
 * automation-transforms.test.mjs runs every function here.
 */
import type { Box } from "@/lib/automations/boxes";

const lines = (text: string): string[] => text.split("\n").map((l) => l.trimEnd()).filter((l) => l.trim() !== "");

/** Items are lines. A line that reads "field: value" is an item with that field. */
function fieldOf(line: string, field: string): string {
  const m = line.match(new RegExp(`(?:^|[,;|]\\s*)${field.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*[:=]\\s*([^,;|]*)`, "i"));
  return m ? m[1].trim() : line.trim();
}

/** The kinds applyTransform handles. */
export const REAL_TRANSFORM_KINDS = new Set<Box["kind"]>(["limit", "sort", "remove_duplicates", "set"]);

export function applyTransform(box: Box, text: string): string {
  switch (box.kind) {
    case "limit":
      return lines(text).slice(0, box.maxItems).join("\n");
    case "sort": {
      // The reader's own ordering, accents folded the way a person sorts
      // (lib/text/search-match.ts says why a plain < is wrong for Greek).
      const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
      const sorted = [...lines(text)].sort((a, b) => collator.compare(fieldOf(a, box.field), fieldOf(b, box.field)));
      return (box.direction === "desc" ? sorted.reverse() : sorted).join("\n");
    }
    case "remove_duplicates": {
      const seen = new Set<string>();
      const out: string[] = [];
      for (const line of lines(text)) {
        const key = fieldOf(line, box.field).normalize("NFKC").toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(line);
      }
      return out.join("\n");
    }
    case "set": {
      const extra = box.assignments.filter((a) => a.field.trim()).map((a) => `${a.field.trim()}: ${a.value}`);
      const base = text.trim();
      return [base, ...extra].filter(Boolean).join("\n");
    }
    default:
      return text;
  }
}
