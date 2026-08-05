"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Users, Clock, CheckCircle2, Trash2 } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { useFormatRelativeTime } from "@/lib/use-relative-time";
import { useToast } from "@/components/toast/toast-context";
import { getErrorMessage } from "@/lib/get-error-message";

export type TeamMember = {
  id: string;
  member_email: string;
  status: "invited" | "active";
  role: string | null;
  invited_at: string;
  joined_at: string | null;
};

export function TeamMembersList({ members: initialMembers }: { members: TeamMember[] }) {
  const formatRelativeTime = useFormatRelativeTime();
  const t = useTranslations("dashboard.team");
  const { addToast } = useToast();
  const [members, setMembers] = useState(initialMembers);
  const [removingId, setRemovingId] = useState<string | null>(null);

  async function removeMember(member: TeamMember) {
    if (!window.confirm(t("removeConfirm", { email: member.member_email }))) {
      return;
    }

    setRemovingId(member.id);
    // Goes through a server route (not a direct client-side delete) — only
    // the admin client can also reset the removed member's OWN
    // subscription_tier back to "free" (their access is a copy made at
    // accept-time, not looked up live), which a plain RLS-scoped delete
    // from the browser has no way to do.
    try {
      const res = await fetch("/api/team/remove", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberId: member.id }),
      });
      const data = await res.json();

      if (!res.ok || !data.ok) {
        // eslint-disable-next-line no-console
        console.error("Remove team member error:", data.error);
        addToast(`✗ ${getErrorMessage(data.error, "could not remove member")}`, "error");
        return;
      }

      setMembers((prev) => prev.filter((m) => m.id !== member.id));
      addToast("✓ member removed");
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("Remove team member threw:", err);
      addToast("✗ could not remove member", "error");
    } finally {
      setRemovingId(null);
    }
  }

  if (members.length === 0) {
    return <EmptyState icon={Users}>{t("noMembers")}</EmptyState>;
  }

  return (
    <div className="space-y-2">
      {members.map((member) => (
        <div
          key={member.id}
          className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-panel px-4 py-3"
        >
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-foreground">
              {member.member_email}
              {member.role && (
                <span className="ml-2 text-xs font-normal text-muted">— {member.role}</span>
              )}
            </p>
            <p
              className="text-xs text-muted"
              title={new Date(member.invited_at).toLocaleString()}
              suppressHydrationWarning
            >
              {member.status === "active"
                ? t("joined", { time: formatRelativeTime(member.joined_at ?? member.invited_at) })
                : t("invitedAt", { time: formatRelativeTime(member.invited_at) })}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span
              className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium ${
                member.status === "active"
                  ? "border-emerald-800 bg-emerald-950/30 text-emerald-400"
                  : "border-orange-800 bg-orange-950/30 text-orange-400"
              }`}
            >
              {member.status === "active" ? (
                <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
              ) : (
                <Clock className="h-3 w-3" aria-hidden="true" />
              )}
              {member.status === "active" ? t("active") : t("invited")}
            </span>
            <button
              type="button"
              onClick={() => removeMember(member)}
              disabled={removingId === member.id}
              aria-label={t("removeLabel", { email: member.member_email })}
              title={t("removeTitle")}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-red-400/70 transition-colors duration-150 hover:bg-red-950/30 hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
