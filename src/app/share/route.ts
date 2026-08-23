import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { logApiError } from "@/lib/log-error";
import { ingestFileBytes } from "@/lib/files/ingest";
import { maxUploadsPerHour } from "@/lib/files/limits";
import { getSiteUrl } from "@/lib/site-url";
import { composeSharedText, encodeSharePayload } from "@/lib/pwa/share-payload";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
// Same ceiling as /api/files/upload, for the same reason: extraction of a
// shared PDF runs inline, and the alternative is a row stuck in
// "processing" that a killed function never finishes.
export const maxDuration = 60;

/**
 * The Web Share Target — "share this to Ionexa" from any app's share
 * sheet.
 *
 * The operating system delivers a share as a real form POST to this URL,
 * which is why it is a ROUTE and not a page: a page cannot receive a POST.
 * The manifest names it (see src/app/manifest.ts, `share_target`).
 *
 * TWO KINDS OF SHARE ARRIVE HERE, and they belong in different places:
 *
 *   FILES go to the Files workspace, through exactly the same ingest as a
 *   drag-and-drop upload — the same size ceiling, the same type sniffing
 *   from CONTENT, the same plan caps, the same hourly rate limit. A share
 *   that bypassed any of those would be a way to put a file into the
 *   product that the product had already decided to refuse.
 *
 *   TEXT AND LINKS go to Create Studio, which is the surface that decides
 *   what a sentence IS. The text rides in a URL FRAGMENT, so the user's
 *   shared content never reaches the server log or their history — see
 *   lib/pwa/share-payload.ts for why not a query string or a cookie.
 *
 * Every exit is a 303. A share is a POST, and a 303 is what tells the
 * browser to follow it with an ordinary GET — without it, a reload of the
 * landing page would re-submit the share.
 */

/** How many files one share may carry. A share sheet sends a handful; the
 *  cap is what stops a scripted POST turning one request into fifty
 *  inline extractions. */
const MAX_SHARED_FILES = 5;

function seeOther(path: string): NextResponse {
  return NextResponse.redirect(new URL(path, getSiteUrl()), 303);
}

export async function POST(request: Request) {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      // The share payload cannot survive a login round-trip — a POST body
      // is gone the moment we redirect, and files cannot be parked
      // anywhere the signed-out visitor is allowed to write. So say so on
      // the other side rather than dropping it silently.
      return seeOther("/login?shared=1");
    }

    let form: FormData;
    try {
      form = await request.formData();
    } catch (err) {
      logApiError("/share", err, { stage: "formdata" });
      return seeOther("/dashboard/create?share_error=unreadable");
    }

    const files = form
      .getAll("files")
      .filter((entry): entry is File => entry instanceof File && entry.size > 0);

    if (files.length > 0) {
      const limited = await checkRateLimit({
        scope: "file_upload",
        identifier: user.id,
        maxAttempts: maxUploadsPerHour(),
        windowMinutes: 60,
      });
      if (!limited.allowed) {
        return seeOther("/dashboard/files?share_error=rate_limit");
      }

      let stored = 0;
      let refused = 0;
      let firstRefusal: string | null = null;

      // Sequentially: each ingest runs a CPU-bound extraction, and five at
      // once inside a 60s function is how a share becomes a timeout.
      for (const file of files.slice(0, MAX_SHARED_FILES)) {
        try {
          const result = await ingestFileBytes({
            supabase,
            user,
            bytes: Buffer.from(await file.arrayBuffer()),
            rawFilename: file.name,
            contentType: file.type || null,
          });
          if (result.ok) {
            stored += 1;
          } else {
            refused += 1;
            if (!firstRefusal) firstRefusal = result.error;
          }
        } catch (err) {
          refused += 1;
          logApiError("/share", err, { stage: "ingest" });
        }
      }

      const params = new URLSearchParams({ shared: String(stored) });
      if (refused > 0) params.set("share_failed", String(refused));
      if (firstRefusal) params.set("share_reason", firstRefusal.slice(0, 200));
      if (files.length > MAX_SHARED_FILES) {
        params.set("share_dropped", String(files.length - MAX_SHARED_FILES));
      }
      return seeOther(`/dashboard/files?${params.toString()}`);
    }

    const text = composeSharedText({
      title: String(form.get("title") ?? ""),
      text: String(form.get("text") ?? ""),
      url: String(form.get("url") ?? ""),
    });

    if (!text) {
      return seeOther("/dashboard/create?share_error=empty");
    }

    return seeOther(`/dashboard/create#share=${encodeSharePayload({ text })}`);
  } catch (err) {
    logApiError("/share", err, { stage: "unhandled" });
    return seeOther("/dashboard/create?share_error=failed");
  }
}

/**
 * A GET here is someone opening the URL by hand, or a platform that only
 * supports a GET share target. Both mean "there is nothing to receive" —
 * send them to the surface a share would have landed on.
 */
export async function GET(request: Request) {
  const incoming = new URL(request.url);
  const text = composeSharedText({
    title: incoming.searchParams.get("title") ?? "",
    text: incoming.searchParams.get("text") ?? "",
    url: incoming.searchParams.get("url") ?? "",
  });
  if (!text) return seeOther("/dashboard/create");
  return seeOther(`/dashboard/create#share=${encodeSharePayload({ text })}`);
}
