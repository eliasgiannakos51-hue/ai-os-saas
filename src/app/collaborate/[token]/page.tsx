import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Users } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { inviteExpired } from "@/lib/collaboration/collaboration";
import { AcceptInvite } from "./accept-invite";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Project invite" };

/**
 * The invite landing page (V3 Task 11).
 *
 * Renders a PREVIEW of the invite — who, which project, what role — and
 * a button. The button is the only thing that grants anything, and it
 * POSTs to /api/collaboration/accept where every check lives. This page
 * deliberately shows the preview even before sign-in: the whole point of
 * the invite email is to bring a NEW user to the product, and a login
 * wall with no explanation of what is behind it loses exactly those
 * people. What it shows is what the email already said — the inviter,
 * the goal line, the role — so the token reveals nothing its bearer was
 * not already sent.
 */
export default async function CollaborateAcceptPage({ params }: { params: { token: string } }) {
  const t = await getTranslations("collaboration");
  const token = (params.token ?? "").trim();

  // The lookup is read-only and by exact token. The admin client is
  // required (an invitee can never read the invites table under RLS) and
  // safe here: the token IS the capability, and this page only reflects
  // back what the email carrying that token already contained.
  let invite: {
    email: string;
    role: string;
    status: string;
    created_at: string;
    project_id: string;
    owner_id: string;
  } | null = null;
  let goal = "";
  let inviterEmail = "";
  if (token && token.length <= 64) {
    const admin = createAdminClient();
    const { data } = await admin
      .from("collaboration_invites")
      .select("email, role, status, created_at, project_id, owner_id")
      .eq("token", token)
      .maybeSingle();
    invite = data ?? null;
    if (invite) {
      const [{ data: mission }, { data: ownerData }] = await Promise.all([
        admin.from("ai_missions").select("goal, user_id").eq("id", invite.project_id).maybeSingle(),
        admin.auth.admin.getUserById(invite.owner_id),
      ]);
      // An invite whose mission is gone (or changed hands) is dead —
      // same rule the accept route enforces.
      if (!mission || mission.user_id !== invite.owner_id) invite = null;
      else {
        goal = mission.goal ?? "";
        inviterEmail = ownerData?.user?.email ?? "";
      }
    }
  }

  const valid = invite && invite.status === "pending" && !inviteExpired(invite.created_at);

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-panel/60 p-6">
        <div className="mb-4 flex items-center gap-2 text-orange-400">
          <Users className="h-5 w-5" aria-hidden="true" />
          <h1 className="text-sm font-semibold text-foreground">{t("pageTitle")}</h1>
        </div>

        {!valid ? (
          <>
            <p className="text-sm leading-relaxed text-muted">{t("invalidInvite")}</p>
            <Link href="/" className="mt-4 inline-block text-xs font-semibold text-orange-400 hover:underline">
              {t("backHome")}
            </Link>
          </>
        ) : (
          <>
            <p className="mb-4 text-sm leading-relaxed text-muted">
              {t("inviteSummary", {
                inviter: inviterEmail,
                role: t(`roles.${invite!.role}`),
              })}
            </p>
            <p className="mb-5 rounded-xl border border-border bg-panel p-3 text-sm font-medium text-foreground">
              {goal}
            </p>

            {user ? (
              <AcceptInvite token={token} />
            ) : (
              <div className="space-y-3">
                <p className="text-xs leading-relaxed text-muted">{t("signInFirst", { email: invite!.email })}</p>
                <div className="flex gap-3">
                  <Link
                    href="/signup"
                    className="inline-flex min-h-[44px] flex-1 items-center justify-center rounded-xl bg-orange-500 px-4 py-2 text-sm font-semibold text-black transition-all hover:opacity-90"
                  >
                    {t("signUp")}
                  </Link>
                  <Link
                    href="/login"
                    className="inline-flex min-h-[44px] flex-1 items-center justify-center rounded-xl border border-border px-4 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-panel"
                  >
                    {t("logIn")}
                  </Link>
                </div>
                <p className="text-[11px] leading-relaxed text-muted">{t("comeBackHint")}</p>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
