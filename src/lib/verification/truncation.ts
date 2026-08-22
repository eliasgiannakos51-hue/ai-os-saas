/**
 * DID THE MODEL FINISH, OR DID IT RUN OUT OF ROOM?
 *
 * Anthropic answers that in every response, in `stop_reason`. Measured
 * across this codebase before this file existed: THIRTY-FOUR call sites
 * pass a max_tokens, and ONE of them — website-builder.ts — ever looked
 * at the answer. The other thirty-three take `response.content`, join the
 * text blocks and ship the result.
 *
 * That is not a hypothetical. The research synthesiser allows 8,000
 * tokens and validates its output with `if (markdown.length < 100)`. A
 * report cut off mid-sentence at the ceiling is far longer than 100
 * characters, so it passes, is written to a document, and is handed to
 * the user as a finished report — with a conclusion that does not exist.
 *
 * WHY A SHARED HELPER RATHER THAN A CHECK PER SITE. The extraction is
 * already duplicated thirty-three times as
 * `.filter(b => b.type === "text").map(b => b.text).join("")`. Adding a
 * stop_reason check beside each copy would make thirty-three places to
 * forget. Taking the text through one function makes the truncation flag
 * impossible to obtain the text without.
 */
import type Anthropic from "@anthropic-ai/sdk";

export type ModelText = {
  text: string;
  /** True when the model stopped because it hit max_tokens, not because
   *  it had finished. */
  truncated: boolean;
  /** Verbatim, for logs — "end_turn", "max_tokens", "stop_sequence",
   *  "tool_use", or null on a shape that carries none. */
  stopReason: string | null;
};

/**
 * The text of a response, and whether it is all of it.
 *
 * Accepts the minimum shape rather than the full SDK type so a test can
 * build one without constructing an entire Message, and so a streaming
 * accumulator with the same two fields works unchanged.
 */
export function modelText(response: {
  content: Array<{ type: string; text?: string }> | Anthropic.ContentBlock[];
  stop_reason?: string | null;
}): ModelText {
  const text = (response.content as Array<{ type: string; text?: string }>)
    .filter((block) => block.type === "text")
    .map((block) => block.text ?? "")
    .join("");
  const stopReason = response.stop_reason ?? null;
  return { text, truncated: stopReason === "max_tokens", stopReason };
}

/**
 * WHAT A TRUNCATED DELIVERABLE SHOULD SAY, and why it is not silence and
 * not a thrown error.
 *
 * Throwing loses work the user has already paid for: eight thousand
 * tokens of a real report are worth more than an error page, and the
 * next attempt costs the same again with no reason to end differently.
 * Silence is worse — it presents a severed document as a complete one.
 *
 * So the partial output is kept and LABELLED, in the reader's own
 * language, at the point where it stops. What the reader must not be
 * able to do is mistake where the document ended for where the author
 * meant it to.
 */
export function truncationNotice(locale: string): string {
  const NOTICES: Record<string, string> = {
    en: "This output reached its length limit and stops here — it is not finished.",
    el: "Αυτό το κείμενο έφτασε στο όριο μήκους και σταματά εδώ — δεν είναι ολοκληρωμένο.",
    de: "Diese Ausgabe hat ihre Längengrenze erreicht und endet hier — sie ist nicht vollständig.",
    es: "Esta salida alcanzó su límite de longitud y termina aquí: no está terminada.",
    fr: "Cette sortie a atteint sa limite de longueur et s’arrête ici — elle n’est pas terminée.",
    it: "Questo output ha raggiunto il limite di lunghezza e si ferma qui: non è completo.",
    pt: "Esta saída atingiu o limite de comprimento e termina aqui — não está concluída.",
    ar: "بلغ هذا الناتج حدّ الطول ويتوقف هنا — وهو غير مكتمل.",
    ja: "この出力は長さの上限に達してここで終わっています — 未完成です。",
    zh: "此输出已达到长度上限，到此为止 —— 尚未完成。",
  };
  return NOTICES[locale] ?? NOTICES.en;
}
