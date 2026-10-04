import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logApiError } from "@/lib/log-error";
import { isAdminEmail } from "@/lib/auth/admin-emails";
import { MAIN_SIDEBAR_GROUPS, sidebarGroups } from "@/lib/sidebar-nav";
import { NEVER_RECENT, applyRecentAction, readRecentPrefs, type RecentAction } from "@/lib/nav/recent-tools";

export const dynamic = "force-dynamic";

const ACTIONS: readonly RecentAction[] = ["pin", "unpin", "remove"];

/**
 * Pin, unpin or remove one tool from the sidebar's Recent tools
 * (lib/nav/recent-tools.ts says what each does to the list).
 *
 * ON THE ACCOUNT, as the design asks: the preferences are written to the
 * caller's own user_metadata through their own session — never another
 * person's, and never a service-role client. The tool must be one this
 * person can see in All tools; anything else is refused, so the metadata
 * can only ever hold real routes.
 *
 * No prose in a response: the only caller is the sidebar, which shows its
 * own words, and a status code is what a log needs.
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as { action?: unknown; href?: unknown } | null;
    const action = ACTIONS.find((a) => a === body?.action);
    const href = typeof body?.href === "string" ? body.href : "";
    if (!action || !href) return NextResponse.json({ ok: false }, { status: 400 });

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ ok: false }, { status: 401 });

    const tools = sidebarGroups(MAIN_SIDEBAR_GROUPS, isAdminEmail(user.email))
      .flatMap((g) => g.items.map((i) => i.href))
      .filter((h) => !NEVER_RECENT.includes(h));
    if (!tools.includes(href)) return NextResponse.json({ ok: false }, { status: 400 });

    const next = applyRecentAction(readRecentPrefs(user.user_metadata), action, href, new Date());
    const { error } = await supabase.auth.updateUser({ data: { recent_tools: next } });
    if (error) {
      logApiError("/api/nav/recent-tools", error, { stage: "update_user" });
      return NextResponse.json({ ok: false }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    logApiError("/api/nav/recent-tools", err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
