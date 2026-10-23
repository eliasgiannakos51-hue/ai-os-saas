import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { logApiError } from "@/lib/log-error";
import { safeErrorDetail } from "@/lib/integrations/crypto";
import { getSiteUrl } from "@/lib/site-url";
import { getGitHubUser, listUserInstallations } from "@/lib/github/auth";
import { saveGitHubConnection } from "@/lib/github/store";

export const dynamic = "force-dynamic";

const COOKIE_NAME = "ionexa_github_oauth";
const STATE_TTL_MS = 10 * 60 * 1000;
const STATE_SECRET = () => process.env.GITHUB_APP_CLIENT_SECRET ?? "";

function verifyState(raw: string): { ok: true; payload: { n: string; u: string; t: number } } | { ok: false; reason: string } {
  const dot = raw.lastIndexOf(".");
  if (dot < 1) return { ok: false, reason: "malformed" };
  const payloadB64 = raw.slice(0, dot);
  const sig = raw.slice(dot + 1);

  let payloadStr: string;
  try {
    payloadStr = Buffer.from(payloadB64, "base64url").toString("utf8");
  } catch {
    return { ok: false, reason: "malformed" };
  }

  const expected = createHmac("sha256", STATE_SECRET()).update(payloadStr).digest("base64url");
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
    return { ok: false, reason: "invalid_signature" };
  }

  try {
    const parsed = JSON.parse(payloadStr) as { n?: string; u?: string; t?: number };
    if (!parsed.n || !parsed.u || !parsed.t) return { ok: false, reason: "incomplete" };
    if (Date.now() - parsed.t > STATE_TTL_MS) return { ok: false, reason: "expired" };
    return { ok: true, payload: { n: parsed.n, u: parsed.u, t: parsed.t } };
  } catch {
    return { ok: false, reason: "malformed" };
  }
}

export async function GET(request: Request) {
  const back = (status: string) =>
    NextResponse.redirect(`${getSiteUrl().replace(/\/+$/, "")}/dashboard/coding?github=${status}`);

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return NextResponse.redirect(`${getSiteUrl().replace(/\/+$/, "")}/login`);

    const url = new URL(request.url);
    if (url.searchParams.get("error")) return back("cancelled");

    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    if (!code || !state) return back("invalid_response");

    const stateCheck = verifyState(state);
    if (!stateCheck.ok) return back(stateCheck.reason === "expired" ? "expired" : "invalid_state");

    if (stateCheck.payload.u !== user.id) return back("invalid_state");

    const cookieStore = await cookies();
    const raw = cookieStore.get(COOKIE_NAME)?.value;
    if (!raw) return back("invalid_state");

    let stored: { n?: string };
    try {
      stored = JSON.parse(raw);
    } catch {
      return back("invalid_state");
    }
    if (!stored.n || stored.n !== stateCheck.payload.n) return back("invalid_state");

    const tokenResponse = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        client_id: process.env.GITHUB_APP_CLIENT_ID,
        client_secret: process.env.GITHUB_APP_CLIENT_SECRET,
        code,
      }),
      cache: "no-store",
    });
    if (!tokenResponse.ok) return back("exchange_failed");
    const tokenBody = (await tokenResponse.json()) as { access_token?: string; error?: string };
    if (!tokenBody.access_token || tokenBody.error) return back("exchange_failed");

    const ghUser = await getGitHubUser(tokenBody.access_token);
    if (!ghUser) return back("user_fetch_failed");

    const installations = await listUserInstallations(tokenBody.access_token);
    const installationId = installations.length > 0 ? installations[0].id : null;

    const saved = await saveGitHubConnection({
      userId: user.id,
      githubUserId: ghUser.id,
      githubLogin: ghUser.login,
      accessToken: tokenBody.access_token,
      installationId,
    });

    const response = saved.ok ? back("connected") : back("save_failed");
    response.cookies.set({
      name: COOKIE_NAME,
      value: "",
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/api/github",
      maxAge: 0,
    });
    return response;
  } catch (err) {
    logApiError("/api/github/callback", safeErrorDetail(err));
    return back("error");
  }
}
