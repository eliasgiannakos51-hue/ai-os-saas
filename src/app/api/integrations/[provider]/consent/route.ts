import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { logApiError } from "@/lib/log-error";
import { getProvider, isProviderId } from "@/lib/integrations/providers";
import { recordConsent, revokeConsent, CONSENT_VERSION } from "@/lib/integrations/consent";
import { disconnectIntegration } from "@/lib/integrations/store";

export const dynamic = "force-dynamic";

// The step before the redirect.
//
// POST records that this person, at this moment, agreed to this wording
// for this provider. /connect refuses to send anyone to Google without a
// row from here, which is what turns the consent screen from something
// displayed into something required.
//
// DELETE withdraws it, and disconnects in the same breath. Withdrawing
// consent while the token keeps working would be a worse state than never
// having a consent record at all — the user would have been told they had
// revoked something they had not.
export async function POST(request: Request, { params }: { params: { provider: string } }) {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ ok: false, error: "Not authenticated." }, { status: 401 });
    }

    if (!isProviderId(params.provider)) {
      return NextResponse.json({ ok: false, error: "Unknown provider." }, { status: 404 });
    }
    const provider = getProvider(params.provider)!;

    const limited = await checkRateLimit({
      scope: "integration_consent",
      identifier: user.id,
      maxAttempts: 30,
      windowMinutes: 60,
    });
    if (!limited.allowed) {
      return NextResponse.json({ ok: false, error: "Too many requests." }, { status: 429 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      purpose?: unknown;
      version?: unknown;
    };

    // The client sends back the version it rendered. A mismatch means the
    // page was loaded before a deploy that changed the wording, so the
    // agreement on screen is not the agreement being recorded — refuse and
    // make them read the current one.
    if (body.version !== CONSENT_VERSION) {
      return NextResponse.json(
        { ok: false, staleConsent: true, error: "The consent wording has changed. Reload and read it again." },
        { status: 409 }
      );
    }

    // The purpose is recorded in the user's own language, exactly as it
    // was displayed — which means it comes from the client. It is stored
    // as display text and never interpreted, so the only checks it needs
    // are that it exists and is not absurd.
    const purpose = typeof body.purpose === "string" ? body.purpose.trim() : "";
    if (purpose.length < 10 || purpose.length > 2000) {
      return NextResponse.json(
        { ok: false, error: "Consent could not be recorded." },
        { status: 400 }
      );
    }

    const result = await recordConsent({
      userId: user.id,
      provider: provider.id,
      purpose,
      // From the server-side registry, NOT from the request: the scopes
      // recorded have to be the ones that will actually be requested, and
      // a client-supplied list would let the record understate them.
      scopes: provider.scopes,
    });
    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: "Consent could not be recorded." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      consentId: result.id,
      // Where to go next. Returned rather than assumed by the client so
      // there is exactly one definition of the connect URL.
      connectUrl: `/api/integrations/${provider.id}/connect`,
    });
  } catch (err) {
    logApiError("/api/integrations/[provider]/consent", err, { provider: params.provider });
    return NextResponse.json({ ok: false, error: "Something went wrong." }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: { provider: string } }) {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ ok: false, error: "Not authenticated." }, { status: 401 });
    }
    if (!isProviderId(params.provider)) {
      return NextResponse.json({ ok: false, error: "Unknown provider." }, { status: 404 });
    }

    const limited = await checkRateLimit({
      scope: "integration_consent_revoke",
      identifier: user.id,
      maxAttempts: 30,
      windowMinutes: 60,
    });
    if (!limited.allowed) {
      return NextResponse.json({ ok: false, error: "Too many requests." }, { status: 429 });
    }

    // Disconnect FIRST, then mark the consent withdrawn. In this order a
    // failure leaves the consent still live and the token possibly gone —
    // recoverable, and visibly so. The other order would tell the user
    // their consent was withdrawn while the AI could still read their mail.
    const disconnected = await disconnectIntegration(user.id, params.provider);
    const revoked = await revokeConsent(user.id, params.provider);

    if (!revoked.ok) {
      return NextResponse.json(
        { ok: false, error: "Could not withdraw that consent." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      // Honest about the third party: we can withdraw our own record and
      // delete our own token, but whether Google accepted the revoke is a
      // separate fact and the user may want to check their own account.
      disconnected: disconnected.ok,
      revokedAtProvider: disconnected.revokedAtProvider,
    });
  } catch (err) {
    logApiError("/api/integrations/[provider]/consent", err, { provider: params.provider });
    return NextResponse.json({ ok: false, error: "Something went wrong." }, { status: 500 });
  }
}
