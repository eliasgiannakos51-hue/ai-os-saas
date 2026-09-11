import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { buildCachedSystem } from "@/lib/ai/cached-system";
import { CostAccumulator } from "@/lib/billing/cost-accumulator";
import { parseDeckToolInput, type Deck, type ImageSource } from "@/lib/presentations/deck";
import {
  PRESENTATION_MAX_TOKENS,
  PRESENTATION_MODEL,
  WRITE_DECK_TOOL,
  buildDeckSystemPrompt,
  buildDeckUserMessage,
} from "@/lib/presentations/prompt";

/**
 * ONE FORCED-TOOL CALL THAT WRITES A DECK.
 *
 * The same shape as Create Studio's detector and the agent builder: the
 * model is handed a tool whose schema IS the deck, tool_choice forces it,
 * and what comes back is parsed by lib/presentations/deck.ts, which
 * clamps every field. No streaming — a deck is produced whole or not at
 * all, which is what lets the route release the hold in full when the
 * person presses Stop.
 *
 * WHAT THE MODEL IS NOT ASKED TO DO. It does not pick photos — it writes
 * an `imageQuery` for a slide that would benefit from one, and the route
 * decides whether that becomes an Unsplash search, one of the person's
 * own uploads, or nothing (lib/presentations/images.ts). It does not
 * decide the language: that is resolved from the description's own
 * script (lib/text/resolve-language.ts) and told to it, so a Greek brief
 * yields a Greek deck whatever the interface is set to.
 *
 * The prompt, the tool schema and the user turn live in
 * lib/presentations/prompt.ts, which has no SDK in it so the build gate
 * can load them; this file is the part that speaks to Anthropic.
 */

/** The shape is checked HERE, once: prompt.ts declares the tool without
 *  the SDK type so a gate can load it, and this binding is what makes a
 *  drift between the two a compile error rather than a 400. */
const writeDeckTool: Anthropic.Tool = WRITE_DECK_TOOL;

export type GenerateDeckResult =
  | { ok: true; deck: Deck }
  | { ok: false; kind: "aborted" | "no_tool_use" | "unusable" | "provider"; detail: string };

/**
 * Makes the call and records its usage on the caller's accumulator.
 *
 * The accumulator is recorded BEFORE the parse, so a response that came
 * back malformed is still paid for — the tokens were spent — and the
 * route settles it rather than releasing. An abort (the Stop button) and
 * a provider failure record nothing, because nothing was delivered.
 */
export async function generateDeck(params: {
  apiKey: string;
  description: string;
  slideCount: number;
  locale: string;
  imageSource: ImageSource;
  costs: CostAccumulator;
  signal?: AbortSignal;
}): Promise<GenerateDeckResult> {
  const anthropic = new Anthropic({ apiKey: params.apiKey });
  let response: Anthropic.Message;
  try {
    response = await anthropic.messages.create(
      {
        model: PRESENTATION_MODEL,
        max_tokens: PRESENTATION_MAX_TOKENS,
        system: buildCachedSystem({ staticPrefix: buildDeckSystemPrompt(), model: PRESENTATION_MODEL }),
        messages: [
          { role: "user", content: buildDeckUserMessage(params.description, params.slideCount, params.locale) },
        ],
        tools: [writeDeckTool],
        tool_choice: { type: "tool", name: "write_deck" },
      },
      { signal: params.signal }
    );
  } catch (err) {
    if (params.signal?.aborted) return { ok: false, kind: "aborted", detail: "stopped by the user" };
    return { ok: false, kind: "provider", detail: err instanceof Error ? err.message : String(err) };
  }

  params.costs.record("generation", response.usage, response.model || PRESENTATION_MODEL);

  // A SEVERED DECK IS NOT A SHORT DECK. When the output ceiling cuts the
  // tool call, whatever partial input survived would parse as a deck with
  // fewer slides than were asked for — and be shown as one. The ceiling
  // is sized well above the twenty-slide maximum (see prompt.ts), so this
  // is rare, and when it happens the honest answer is "unusable": the
  // tokens were spent and the route settles them, as it does for any
  // answer that is not a deck.
  if (response.stop_reason === "max_tokens") {
    return { ok: false, kind: "unusable", detail: "truncated at the output ceiling" };
  }

  const toolUse = response.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === "tool_use"
  );
  if (!toolUse) return { ok: false, kind: "no_tool_use", detail: "the model returned no deck" };

  const verdict = parseDeckToolInput(toolUse.input, {
    locale: params.locale,
    imageSource: params.imageSource,
    fallbackTitle: params.description.slice(0, 60),
  });
  if (!verdict.ok) return { ok: false, kind: "unusable", detail: verdict.reason };
  return { ok: true, deck: verdict.deck };
}
