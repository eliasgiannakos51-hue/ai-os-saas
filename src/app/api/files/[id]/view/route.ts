import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { logApiError } from "@/lib/log-error";
import { isFeatureOn } from "@/lib/flags/flags";
import { FILE_BUCKET, SIGNED_URL_TTL_SECONDS } from "@/lib/files/store";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

/**
 * A PDF, OPENED AT A PAGE (MASTER 16, package 12), behind the switch
 * "file-pages": a page reference in an answer is a link here, opened in a
 * new tab, and this answers with a redirect to the file itself at
 * `#page=N` — the address every browser's PDF viewer opens on that page.
 * A link, not a script: a tab opened after an await is a popup, and
 * popups are blocked.
 *
 * The same guarantees as the download link beside it
 * (api/files/[id]/download): the object is the requester's own, by a query
 * filtered on user_id; the link is signed for SIGNED_URL_TTL_SECONDS; the
 * route is rate limited, in the same scope, because it mints credentials.
 * Unlike the download it asks storage for no attachment name, so the PDF
 * opens rather than saves. PDFs only — "page" means nothing to a .txt.
 *
 * Codes, not sentences, for anything that is not the redirect.
 */
export async function GET(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const raw = new URL(request.url).searchParams.get("page") ?? "1";
  if (!/^\d{1,6}$/.test(raw) || Number(raw) < 1) return NextResponse.json({ ok: false, code: "bad_page" }, { status: 400 });
  const page = Number(raw);
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ ok: false, code: "not_authenticated" }, { status: 401 });
    if (!(await isFeatureOn("file-pages", user))) return NextResponse.json({ ok: false, code: "not_enabled" }, { status: 403 });

    const limited = await checkRateLimit({ scope: "file_download", identifier: user.id, maxAttempts: 120, windowMinutes: 60 });
    if (!limited.allowed) return NextResponse.json({ ok: false, code: "rate_limited" }, { status: 429 });

    const { data: file, error } = await supabase
      .from("user_files")
      .select("id, file_type, storage_path")
      .eq("id", params.id)
      .eq("user_id", user.id)
      .maybeSingle();
    if (error) {
      logApiError("/api/files/[id]/view", error, { stage: "load" });
      return NextResponse.json({ ok: false, code: "load_failed" }, { status: 500 });
    }
    if (!file) return NextResponse.json({ ok: false, code: "not_found" }, { status: 404 });
    if (file.file_type !== "pdf") return NextResponse.json({ ok: false, code: "not_a_pdf" }, { status: 400 });

    const { data: signed, error: signError } = await supabase.storage
      .from(FILE_BUCKET)
      .createSignedUrl(String(file.storage_path), SIGNED_URL_TTL_SECONDS);
    if (signError || !signed?.signedUrl) {
      logApiError("/api/files/[id]/view", signError, { stage: "sign" });
      return NextResponse.json({ ok: false, code: "sign_failed" }, { status: 502 });
    }
    const response = NextResponse.redirect(`${signed.signedUrl}#page=${page}`, 302);
    // The signed address is a bearer token: never cached, never sent on.
    response.headers.set("Cache-Control", "no-store");
    response.headers.set("Referrer-Policy", "no-referrer");
    return response;
  } catch (err) {
    logApiError("/api/files/[id]/view", err, {});
    return NextResponse.json({ ok: false, code: "unexpected" }, { status: 500 });
  }
}
