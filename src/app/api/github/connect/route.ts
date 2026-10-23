import { NextResponse } from "next/server";
import { randomBytes, createHmac } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { logApiError } from "@/lib/log-error";
import { encryptionAvailable } from "@/lib/integrations/crypto";
import { githubAppConfigured } from "@/lib/github/auth";
import { isFeatureOn } from "@/lib/flags/flags";
import { getSiteUrl } from "@/lib/site-url";

export const dynamic = "force-dynamic";

const COOKIE_NAME = "ionexa_github_oauth";
const STATE_SECRET = () => process.env.GITHUB_APP_CLIENT_SECRET ?? "";

function signState(payload: string): string {
  return createHmac("sha256", STATE_SECRET()).update(payload).digest("base64url");
}

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ ok: false, error: "Not authenticated." }, { status: 401 });
    }

    if (!(await isFeatureOn("coding-github", user))) {
      return NextResponse.json({ ok: false, error: "Not available." }, { status: 404 });
    }

    if (!githubAppConfigured() || !encryptionAvailable()) {
      return NextResponse.json(
        { ok: false, error: "GitHub integration is not configured on this deployment." },
        { status: 503 }
      );
    }

    const limited = await checkRateLimit({
      scope: "github_connect",
      identifier: user.id,
      maxAttempts: 10,
      windowMinutes: 60,
    });
    if (!limited.allowed) {
      return NextResponse.json({ ok: false, error: "Too many attempts." }, { status: 429 });
    }

    const nonce = randomBytes(24).toString("base64url");
    const payload = JSON.stringify({ n: nonce, u: user.id, t: Date.now() });
    const state = `${Buffer.from(payload).toString("base64url")}.${signState(payload)}`;

    const clientId = process.env.GITHUB_APP_CLIENT_ID!;
    const redirectUri = `${getSiteUrl().replace(/\/+$/, "")}/api/github/callback`;
    const authorizeUrl = `https://github.com/login/oauth/authorize?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${encodeURIComponent(state)}`;

    const response = NextResponse.redirect(authorizeUrl);
    response.cookies.set({
      name: COOKIE_NAME,
      value: JSON.stringify({ n: nonce }),
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/api/github",
      maxAge: 600,
    });
    return response;
  } catch (err) {
    logApiError("/api/github/connect", err);
    return NextResponse.json({ ok: false, error: "Something went wrong." }, { status: 500 });
  }
}
