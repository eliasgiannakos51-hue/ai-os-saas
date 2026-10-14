"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { ApiError } from "@/lib/errors/api-error";
import { isErrorCode } from "@/lib/errors/error-codes";
import { useErrorText } from "@/lib/errors/use-error-text";

/**
 * WHAT /api/chat SAYS WHEN IT DOES NOT ANSWER, IN THE READER'S LANGUAGE —
 * once, for every screen that talks to it: the Chat
 * (components/chat/chat-workspace.tsx), the conversation beside a Create
 * Studio goal (components/create/studio-chat.tsx) and the voice
 * conversation (components/voice/voice-conversation.tsx).
 *
 * The route's `message` and `error` are English sentences for logs. What
 * it says as values is said here (2026-10-14):
 *   - out of credits (`outOfCredits`), with the two numbers it sends;
 *   - a limit by its own name (`code`: lib/ai-circuit-breaker.ts) and,
 *     when the route knows it, the time it opens again (`retryAt`) — not
 *     «wait about a minute» for a limit that counts an hour or a day;
 *   - the AI service failing, or a hold it could not take, with what the
 *     route says about the money (`creditsRefunded`: nothing was charged)
 *     rather than «we cannot confirm whether this was charged»;
 *   - anything it did not name, from its status (lib/errors/error-codes.ts).
 * Before 2026-10-14 the Studio showed the route's English as it came, and
 * the voice conversation showed a failed stream's English and took a
 * refusal (a JSON answer, not a stream) for an empty reply, saying nothing.
 */
export function useChatFailureWords() {
  const describe = useErrorText();
  const tErrors = useTranslations("errors");
  const tOutOfCredits = useTranslations("credits.outOfCredits");

  return useMemo(() => {
    const outOfCredits = (available: unknown, needed: unknown): string =>
      `${tErrors("codes.insufficientCredits.what")} ${
        typeof available === "number" && typeof needed === "number"
          ? tOutOfCredits("detailWithNumbers", { available, needed })
          : tOutOfCredits("detail")
      }`;
    const said = (status: number, value: Record<string, unknown> | null | undefined): string =>
      describe(
        new ApiError(status, {
          code: isErrorCode(value?.code) ? value.code : undefined,
          creditsRefunded: value?.creditsRefunded === true ? true : undefined,
          retryAt: typeof value?.retryAt === "string" ? value.retryAt : undefined,
        })
      ).text;
    return {
      outOfCredits,
      /**
       * A refusal before the answer started: the JSON body the route sent
       * instead of a stream. A `rateLimited` one was refused before anything
       * ran (a 429 in creditOutcomeForStatus terms: nothing was charged).
       */
      refusal(status: number, data: Record<string, unknown> | null | undefined): string {
        if (data?.rateLimited) return data.outOfCredits === true ? outOfCredits(data.available, data.needed) : said(429, data);
        return said(status, data);
      },
      /** The stream's own `error` event: what the route names, or a failure on our side. */
      streamError(event: Record<string, unknown>): string {
        if (event.outOfCredits === true) return outOfCredits(event.available, event.needed);
        return said(event.code === "upstreamUnavailable" ? 503 : 500, event);
      },
    };
  }, [describe, tErrors, tOutOfCredits]);
}
