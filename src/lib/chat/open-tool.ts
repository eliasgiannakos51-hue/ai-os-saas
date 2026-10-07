import { matchProducer } from "@/lib/create-studio/producer-routes";
import { opensWithInstruction } from "@/lib/create-studio/intent-signals";

/**
 * SHOULD THIS CHAT MESSAGE OPEN THE SITE BESIDE THE CONVERSATION?
 * (MASTER 16, package 7: «γράφω "φτιάξε μου site για το camping" και
 * ανοίγει το Site δίπλα».)
 *
 * Two free reads, both shared with the rest of the app, no model call:
 * the producer matcher Home uses names a site and nothing else
 * (lib/create-studio/producer-routes.ts), and the message opens with an
 * instruction or an ask rather than being a question or a remark
 * (opensWithInstruction in lib/create-studio/intent-signals.ts). Either
 * one alone would open a tool on "τι είναι καλό site;" or on "μου αρέσει
 * το site σου". Even then nothing is spent: the pane opens on what it
 * will make and its price (components/chat/site-pane.tsx).
 *
 * Held by scripts/tests/chat-opens-tools.test.mjs.
 */
export function openSiteFor(text: string, locale = "en"): boolean {
  const match = matchProducer(text);
  return match.kind === "one" && match.producer === "website" && opensWithInstruction(text, locale);
}
