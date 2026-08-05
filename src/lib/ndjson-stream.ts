// Shared reader for the NDJSON streams this app's AI endpoints return
// (api/chat, api/create-studio, api/text-actions — see ndjsonLine() in
// api/chat/route.ts for the writer side).
//
// DEFECT this exists to fix (found in the V1+V2 audit): all three
// consumers inlined the same read loop, shaped like this —
//
//     try {
//       while (true) { const {value, done} = await reader.read(); ... }
//       if (accumulatedText) commitTheReply()      // <-- inside the try
//     } catch { setError("Network error") }
//
// — so ANY throw between the first delta and the end of the stream jumped
// straight past the commit. The reply the user had just watched arrive,
// token by token, was thrown away and replaced with a generic network
// error.
//
// That is not a theoretical path. `reader.read()` rejects whenever the
// connection drops mid-response: a phone moving between cells or off
// wifi, a laptop suspending, a proxy or tunnel timing out a long
// response. Long AI replies are exactly the ones that take long enough
// for it to happen, and exactly the ones most expensive to lose — the
// user has already been charged for the tokens.
//
// So the contract here is: reading NEVER throws. It reports whether the
// stream ended cleanly, and the caller keeps everything it received
// either way.

export type NdjsonReadResult = {
  /**
   * True when the stream ended abnormally — a dropped connection, an
   * aborted request, a handler that threw. Whatever was already
   * delivered through onEvent stands; the caller decides how to present
   * the interruption.
   */
  interrupted: boolean;
  /** Lines that arrived but were not valid JSON. Normally 0. */
  malformedLines: number;
};

/**
 * Reads a newline-delimited JSON stream, invoking `onEvent` once per
 * parsed line.
 *
 * A single unparseable line is skipped rather than fatal: one corrupted
 * chunk should cost that chunk, not the whole response.
 */
export async function readNdjsonStream(
  body: ReadableStream<Uint8Array>,
  onEvent: (event: Record<string, unknown>) => void
): Promise<NdjsonReadResult> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let interrupted = false;
  let malformedLines = 0;

  function emit(line: string): void {
    if (!line.trim()) return;
    let event: Record<string, unknown>;
    try {
      event = JSON.parse(line) as Record<string, unknown>;
    } catch {
      malformedLines++;
      return;
    }
    onEvent(event);
  }

  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let newlineIndex = buffer.indexOf("\n");
      while (newlineIndex !== -1) {
        const line = buffer.slice(0, newlineIndex);
        buffer = buffer.slice(newlineIndex + 1);
        newlineIndex = buffer.indexOf("\n");
        emit(line);
      }
    }
    // Flush any bytes held by the decoder and any final line the server
    // did not newline-terminate. The writer always appends "\n" today, so
    // this is belt-and-braces rather than a live fix — but a last event
    // that is silently dropped is precisely the kind of failure that
    // takes weeks to notice.
    buffer += decoder.decode();
    emit(buffer);
  } catch {
    // Dropped connection, aborted request, or an onEvent handler that
    // threw. Deliberately swallowed: the caller's accumulated state is
    // valid and must survive.
    interrupted = true;
  } finally {
    // Free the underlying connection. Cancelling an already-finished or
    // already-errored stream is a no-op that can itself reject, so it is
    // guarded too.
    try {
      await reader.cancel();
    } catch {
      /* nothing useful to do here */
    }
  }

  return { interrupted, malformedLines };
}
