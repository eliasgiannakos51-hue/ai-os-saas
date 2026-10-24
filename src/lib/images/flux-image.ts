import "server-only";

/**
 * BLACK FOREST LABS (FLUX.1 [schnell]) — the Image tool's DRAFT provider
 * (docs/IMAGE-PROVIDERS.md, κομμάτι 1). Apache 2.0, open weights, fast:
 * the tier the owner can turn on without Gemini, because the owner's
 * own Vercel already carries `BFL_API_KEY` (set 2026-10-03,
 * docs/api-keys.md — "the owner has these keys in Vercel; the only code
 * that reads them is the key check"; this file is the first that reads
 * it for a real feature).
 *
 * Generation itself (κομμάτι 3) is not built yet — this file is the key
 * presence check alone, which is what decides whether the Image tile
 * can open before Gemini does (src/app/dashboard/tools/page.tsx).
 */
export function draftApiKey(): string {
  return (process.env.BFL_API_KEY || "").trim();
}
