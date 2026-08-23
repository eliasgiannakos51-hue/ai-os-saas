import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logApiError } from "@/lib/log-error";
import {
  BROWSER_FAMILIES,
  DISPLAY_MODES,
  PLATFORMS,
  isInstalledDisplayMode,
  type BrowserFamily,
  type DisplayMode,
  type Platform,
} from "@/lib/pwa/platform";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

/**
 * One row per browser: what platform it is, whether the app is installed
 * on it, and whether notifications were ever accepted.
 *
 * This exists to answer "native app or not" with numbers instead of
 * impressions — see the migration for why the three facts are the ones
 * that decide it.
 *
 * WHAT IT REFUSES TO STORE is as much of the design as what it stores. The
 * request carries no user agent, no screen size, no timezone, no
 * fingerprint: the client has already collapsed itself to one of seven
 * platforms and four browser families, and this route will not accept a
 * value outside those lists. There is nothing here to re-identify a device
 * with, and no way to widen it without changing the check constraints in
 * the database too.
 */

const PUSH_PERMISSIONS = ["granted", "denied", "default", "unsupported"] as const;
const INSTALL_SURFACES = ["native", "ios"] as const;
const INSTALL_OUTCOMES = ["accepted", "dismissed"] as const;

/** Long enough to be unguessable, short enough to bound the column. */
const MAX_CLIENT_ID = 64;

function pick<T extends string>(value: unknown, allowed: readonly T[]): T | null {
  return typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : null;
}

export async function POST(request: Request) {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ ok: false, error: "Not authenticated." }, { status: 401 });

    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
    }

    const clientId = typeof body.clientId === "string" ? body.clientId.trim() : "";
    const platform = pick<Platform>(body.platform, PLATFORMS);
    const browser = pick<BrowserFamily>(body.browser, BROWSER_FAMILIES);
    const displayMode = pick<DisplayMode>(body.displayMode, DISPLAY_MODES);
    const pushPermission = pick(body.pushPermission, PUSH_PERMISSIONS);

    if (!clientId || clientId.length > MAX_CLIENT_ID || !platform || !browser || !displayMode || !pushPermission) {
      return NextResponse.json({ ok: false, error: "Invalid client state." }, { status: 400 });
    }

    // Only the fields actually present are written, so a plain heartbeat
    // cannot erase the install outcome an earlier report recorded.
    const row: Record<string, unknown> = {
      user_id: user.id,
      client_id: clientId,
      platform,
      browser,
      display_mode: displayMode,
      installed: isInstalledDisplayMode(displayMode),
      push_permission: pushPermission,
      push_subscribed: body.pushSubscribed === true,
      last_seen_at: new Date().toISOString(),
    };
    const surface = pick(body.installSurface, INSTALL_SURFACES);
    if (surface) row.install_surface = surface;
    const outcome = pick(body.installOutcome, INSTALL_OUTCOMES);
    if (outcome) row.install_outcome = outcome;

    const { error } = await supabase
      .from("pwa_client_stats")
      .upsert(row, { onConflict: "user_id,client_id" });

    if (error) {
      logApiError("/api/pwa/telemetry", error, { stage: "upsert" });
      // Telemetry is never worth a visible failure: the caller ignores
      // this, and the app carries on.
      return NextResponse.json({ ok: false, error: "Could not record." }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    logApiError("/api/pwa/telemetry", err, { stage: "unhandled" });
    return NextResponse.json({ ok: false, error: "Something went wrong." }, { status: 500 });
  }
}
