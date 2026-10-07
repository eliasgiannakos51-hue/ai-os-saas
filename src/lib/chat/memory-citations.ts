import type { RememberedFact } from "@/lib/chat/memory-prompt";
import type { Provenance } from "@/lib/chat/provenance";

/**
 * WHICH REMEMBERED THINGS AN ANSWER USED (MASTER 16, package 9: «βλέπω
 * ποια στοιχεία μνήμης χρησιμοποίησε»), behind the switch
 * "chat-attachments".
 *
 * Not "what was in the prompt": twenty remembered facts sit in front of
 * every answer, and listing all twenty under "what's the capital of
 * France" says nothing. The model is the only party that knows which ones
 * it leaned on, so it is asked to say: the facts are numbered in the
 * prompt (buildMemoryPromptAddition, numbered), and an answer that used
 * any ends with ONE marker — ⟦μνήμη: 1, 3⟧ — on its own line.
 *
 * THE MARKER NEVER REACHES THE SCREEN OR THE DATABASE. The stream is
 * passed through MemoryMarkerHoldback: everything before the opening
 * bracket is forwarded as it arrives, and from the bracket on it is held.
 * "⟦" is one character, so it cannot arrive split across two deltas; a
 * held tail that turns out NOT to be a marker is released at the end, so
 * an answer that happens to contain the bracket loses nothing.
 *
 * Held by scripts/tests/chat-attachments.test.mjs.
 */

export const MEMORY_MARK_OPEN = "⟦";

const MARKER = /⟦\s*μνήμη\s*:\s*([0-9,\s]*)⟧\s*$/u;

/** The line the system prompt carries when memories are numbered. */
export function memoryCitationInstruction(count: number): string {
  if (count <= 0) return "";
  return (
    `\n\nΤα στοιχεία μνήμης πιο πάνω είναι αριθμημένα από 1 ως ${count}. ` +
    "Αν η απάντησή σου βασίστηκε σε κάποιο από αυτά, γράψε στο ΤΕΛΟΣ της, σε δική του γραμμή, ακριβώς " +
    "«⟦μνήμη: 1, 3⟧» με τους αριθμούς όσων χρησιμοποίησες. Αν δεν χρησιμοποίησες κανένα, μη γράψεις αυτή τη γραμμή. " +
    "Μην εξηγείς τη γραμμή και μην τη γράφεις πουθενά αλλού."
  );
}

/** The answer without its marker, and the 1-based numbers the marker named (in range, once each). */
export function takeMemoryMarker(text: string, count: number): { text: string; cited: number[] } {
  const match = MARKER.exec(text);
  if (!match) return { text, cited: [] };
  const cited = [
    ...new Set(
      match[1]
        .split(/[,\s]+/)
        .map((n) => Number.parseInt(n, 10))
        .filter((n) => Number.isInteger(n) && n >= 1 && n <= count)
    ),
  ].sort((a, b) => a - b);
  return { text: text.slice(0, match.index).replace(/\s+$/u, ""), cited };
}

/** The remembered facts the numbers name, for the screen and the row. */
export function citedMemories(memories: readonly RememberedFact[], cited: readonly number[]): MemoryUsed[] {
  return cited.map((n) => memories[n - 1]).filter(Boolean).map((m) => ({ id: m.id ?? null, text: m.text }));
}

/**
 * Forwards a streamed answer, holding back everything from the marker's
 * opening bracket on. `push` returns what may be shown now; `finish`
 * returns the held tail when it was not a marker (to show), and the
 * numbers when it was.
 */
export class MemoryMarkerHoldback {
  private held = "";
  private holding = false;

  push(delta: string): string {
    if (this.holding) {
      this.held += delta;
      return "";
    }
    const at = delta.indexOf(MEMORY_MARK_OPEN);
    if (at < 0) return delta;
    this.holding = true;
    this.held = delta.slice(at);
    return delta.slice(0, at);
  }

  finish(count: number): { release: string; cited: number[] } {
    if (!this.holding) return { release: "", cited: [] };
    const { text, cited } = takeMemoryMarker(this.held, count);
    // The held tail WAS the marker when stripping it left nothing but
    // space; otherwise it was ordinary text and goes out unchanged.
    if (cited.length > 0 || (text.trim() === "" && MARKER.test(this.held))) return { release: "", cited };
    return { release: this.held, cited: [] };
  }
}

export type MemoryUsed = { id: string | null; text: string };

/**
 * What a stored answer stood on — chat_messages.provenance, written by
 * /api/chat with the switch on: { modules, memories }. Read defensively,
 * so a reloaded conversation shows the same lines under each answer that
 * the stream showed, and a row without it shows none.
 */
export function readAnswerBasis(raw: unknown): { modules: Provenance | null; memories: MemoryUsed[] } {
  if (!raw || typeof raw !== "object") return { modules: null, memories: [] };
  const r = raw as { modules?: unknown; memories?: unknown };
  const modules =
    r.modules && typeof r.modules === "object" && typeof (r.modules as Provenance).entryCount === "number" && Array.isArray((r.modules as Provenance).sources)
      ? (r.modules as Provenance)
      : null;
  return { modules, memories: readMemoriesUsed(r.memories) };
}

/** The `memoriesUsed` a `done` frame or a row carries, as a list of facts. */
export function readMemoriesUsed(raw: unknown): MemoryUsed[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((m): m is { id?: unknown; text: string } => !!m && typeof m === "object" && typeof (m as { text?: unknown }).text === "string")
    .map((m) => ({ id: typeof m.id === "string" ? m.id : null, text: m.text.slice(0, 500) }))
    .filter((m) => m.text.trim())
    .slice(0, 50);
}
