import "server-only";
import { checkRateLimit } from "@/lib/rate-limit";

/**
 * THE BOUND ON AN EXPORT THAT IS CORRECTLY FREE.
 *
 * /api/mission/[id]/pdf, /api/research/[id]/pdf, /api/presentations/[id]/pdf
 * and /api/presentations/[id]/pptx render a document the person already
 * paid for when it was written. Each one says so in its own header, and
 * each one is right: charging again for a second copy of your own report
 * would be charging for the download.
 *
 * But "does not charge" was doing two jobs. It was the answer to "should
 * this reserve credits?" — no — and it was ALSO, silently, the answer to
 * "what stops a thousand of these?" — nothing. A .pptx export downloads
 * every slide photo (lib/presentations/images.ts fetches Unsplash bytes
 * and storage objects in parallel, one per slide) and builds the file in
 * the route's own process. That is real egress and real CPU per request,
 * on a route with no reservation, no limit and no cache.
 *
 * So the reason is kept and the bound is added separately. The number is
 * deliberately generous — 60 an hour is far more than a person exporting
 * their own work reaches, and far less than a loop.
 *
 * Returns true when the caller may proceed.
 */
export async function allowExport(userId: string): Promise<boolean> {
  const { allowed } = await checkRateLimit({
    scope: "document_export",
    identifier: userId,
    maxAttempts: 60,
    windowMinutes: 60,
  });
  return allowed;
}
