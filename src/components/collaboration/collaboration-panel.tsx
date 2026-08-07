"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2, Mail, ShieldX, UserPlus, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { MAX_COLLABORATORS_PER_PROJECT, type CollaboratorRole } from "@/lib/collaboration/collaboration";
import { useFormatRelativeTime } from "@/lib/use-relative-time";
import { getErrorMessage } from "@/lib/get-error-message";

type CollaboratorRow = { id: string; user_id: string; role: string; created_at: string };
type InviteRow = {
  id: string;
  email: string;
  role: string;
  status: string;
  invited_user_id: string | null;
  signup_attributed: boolean;
  created_at: string;
};
type ActivityRow = { id: string; action: string; detail: string | null; created_at: string };

/**
 * The owner's share panel for one project (V3 Task 11).
 *
 * Every read and every revocation here is a plain RLS-scoped client
 * query — the policies in v3_collaboration_migration.sql ARE the
 * authorisation, so there is no API surface to keep in sync with them.
 * The only server routes in the feature are the two that must exist:
 * creating an invite (it sends an email) and accepting one (it mints
 * access with the service role).
 *
 * The "joined Ionexa from your invites" line is the feature's growth
 * measurement, computed from signup_attributed on the accepted invites —
 * a fact recorded once at accept time, not a re-derivable guess.
 */
export function CollaborationPanel({ projectId }: { projectId: string }) {
  const t = useTranslations("collaboration");
  const formatRelativeTime = useFormatRelativeTime();
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [collaborators, setCollaborators] = useState<CollaboratorRow[]>([]);
  const [invites, setInvites] = useState<InviteRow[]>([]);
  const [activity, setActivity] = useState<ActivityRow[]>([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<CollaboratorRole>("editor");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [collabRes, inviteRes, activityRes] = await Promise.all([
      supabase
        .from("project_collaborators")
        .select("id, user_id, role, created_at")
        .eq("project_id", projectId)
        .order("created_at", { ascending: true }),
      supabase
        .from("collaboration_invites")
        .select("id, email, role, status, invited_user_id, signup_attributed, created_at")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("collaboration_activity")
        .select("id, action, detail, created_at")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false })
        .limit(20),
    ]);
    setCollaborators((collabRes.data as CollaboratorRow[] | null) ?? []);
    setInvites((inviteRes.data as InviteRow[] | null) ?? []);
    setActivity((activityRes.data as ActivityRow[] | null) ?? []);
    setLoading(false);
  }, [supabase, projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  const pendingInvites = invites.filter((i) => i.status === "pending");
  const attributedSignups = invites.filter((i) => i.status === "accepted" && i.signup_attributed).length;
  const seatsUsed = collaborators.length + pendingInvites.length;

  const sendInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/collaboration/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, email, role }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        setError(typeof data?.error === "string" ? data.error : t("inviteFailed"));
      } else {
        setEmail("");
        setNotice(t("inviteSent"));
        await load();
      }
    } catch (err) {
      setError(getErrorMessage(err, t("inviteFailed")));
    }
    setBusy(false);
  };

  const revokeInvite = async (id: string) => {
    const { error: revokeError } = await supabase
      .from("collaboration_invites")
      .update({ status: "revoked" })
      .eq("id", id)
      .eq("status", "pending");
    if (revokeError) setError(getErrorMessage(revokeError, t("revokeFailed")));
    await load();
  };

  const removeCollaborator = async (id: string) => {
    const { error: removeError } = await supabase.from("project_collaborators").delete().eq("id", id);
    if (removeError) setError(getErrorMessage(removeError, t("revokeFailed")));
    await load();
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-6 text-xs text-muted">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        {t("loading")}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <p className="text-xs leading-relaxed text-muted">{t("panelIntro")}</p>

      {/* Invite form */}
      <form onSubmit={sendInvite} className="flex flex-wrap items-center gap-2">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={t("emailPlaceholder")}
          className="min-w-0 flex-1 rounded-xl border border-border bg-panel px-3 py-2 text-sm text-foreground placeholder:text-muted focus:border-orange-500/50 focus:outline-none"
        />
        <select
          value={role}
          onChange={(e) => setRole(e.target.value === "viewer" ? "viewer" : "editor")}
          aria-label={t("roleLabel")}
          className="rounded-xl border border-border bg-panel px-3 py-2 text-sm text-foreground focus:border-orange-500/50 focus:outline-none"
        >
          <option value="editor">{t("roles.editor")}</option>
          <option value="viewer">{t("roles.viewer")}</option>
        </select>
        <button
          type="submit"
          disabled={busy || seatsUsed >= MAX_COLLABORATORS_PER_PROJECT}
          className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-orange-500 px-4 py-2 text-sm font-semibold text-black transition-all hover:opacity-90 disabled:opacity-50"
        >
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <UserPlus className="h-4 w-4" aria-hidden="true" />
          )}
          {t("inviteButton")}
        </button>
      </form>
      {error ? <p className="text-xs text-red-400">{error}</p> : null}
      {notice ? <p className="text-xs text-emerald-400">{notice}</p> : null}
      <p className="text-[11px] text-muted">
        {t("seatCount", { used: seatsUsed, max: MAX_COLLABORATORS_PER_PROJECT })}
        {attributedSignups > 0 ? ` · ${t("attributedSignups", { count: attributedSignups })}` : ""}
      </p>

      {/* Members */}
      {collaborators.length > 0 ? (
        <div>
          <h4 className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted">
            <Users className="h-3.5 w-3.5" aria-hidden="true" />
            {t("membersTitle")}
          </h4>
          <ul className="space-y-1.5">
            {collaborators.map((c) => (
              <li
                key={c.id}
                className="flex items-center gap-2 rounded-xl border border-border bg-panel p-2.5 text-xs"
              >
                <span className="flex-1 text-foreground">
                  {/* The email lives on the invite that seated them;
                      membership itself stores only ids. */}
                  {invites.find((i) => i.invited_user_id === c.user_id)?.email ?? t("aCollaborator")}
                </span>
                <span className="text-muted">{t(`roles.${c.role}`)}</span>
                <button
                  type="button"
                  onClick={() => removeCollaborator(c.id)}
                  className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-red-400 transition-colors hover:bg-red-500/10"
                >
                  <ShieldX className="h-3.5 w-3.5" aria-hidden="true" />
                  {t("revoke")}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* Pending invites */}
      {pendingInvites.length > 0 ? (
        <div>
          <h4 className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted">
            <Mail className="h-3.5 w-3.5" aria-hidden="true" />
            {t("pendingTitle")}
          </h4>
          <ul className="space-y-1.5">
            {pendingInvites.map((i) => (
              <li
                key={i.id}
                className="flex items-center gap-2 rounded-xl border border-dashed border-border bg-panel/50 p-2.5 text-xs"
              >
                <span className="flex-1 text-foreground">{i.email}</span>
                <span className="text-muted">{t(`roles.${i.role}`)}</span>
                <button
                  type="button"
                  onClick={() => revokeInvite(i.id)}
                  className="rounded-lg px-2 py-1 text-red-400 transition-colors hover:bg-red-500/10"
                >
                  {t("revoke")}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* Activity */}
      {activity.length > 0 ? (
        <div>
          <h4 className="mb-2 text-xs font-medium text-muted">{t("activityTitle")}</h4>
          <ul className="space-y-1 text-[11px] text-muted">
            {activity.map((a) => (
              <li key={a.id}>
                {t(`activity.${a.action}`, { detail: a.detail ?? "" })} ·{" "}
                {formatRelativeTime(a.created_at)}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
