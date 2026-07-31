"use client";

import { useState } from "react";
import { Users, Clock, CheckCircle2, Trash2 } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { formatRelativeTime } from "@/lib/format-time";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/toast/toast-context";

export type TeamMember = {
  id: string;
  member_email: string;
  status: "invited" | "active";
  invited_at: string;
  joined_at: string | null;
};

export function TeamMembersList({ members: initialMembers }: { members: TeamMember[] }) {
  const supabase = createClient();
  const { addToast } = useToast();
  const [members, setMembers] = useState(initialMembers);
  const [removingId, setRemovingId] = useState<string | null>(null);

  async function removeMember(member: TeamMember) {
    if (
      !window.confirm(
        `Remove ${member.member_email} from your team? They'll immediately lose access to your plan.`
      )
    ) {
      return;
    }

    setRemovingId(member.id);
    // team_members has an owner-only RLS delete policy (auth.uid() =
    // owner_id) — this only ever succeeds for rows this account owns.
    const { error } = await supabase.from("team_members").delete().eq("id", member.id);
    setRemovingId(null);

    if (error) {
      // eslint-disable-next-line no-console
      console.error("Remove team member error:", error);
      addToast("✗ could not remove member", "error");
      return;
    }

    setMembers((prev) => prev.filter((m) => m.id !== member.id));
    addToast("✓ member removed");
  }

  if (members.length === 0) {
    return (
      <EmptyState icon={Users}>
        No team members yet — invite someone above.
      </EmptyState>
    );
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
            </p>
            <p
              className="text-xs text-muted"
              title={new Date(member.invited_at).toLocaleString()}
              suppressHydrationWarning
            >
              {member.status === "active"
                ? `Joined ${formatRelativeTime(member.joined_at ?? member.invited_at)}`
                : `Invited ${formatRelativeTime(member.invited_at)}`}
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
              {member.status === "active" ? "Active" : "Invited"}
            </span>
            <button
              type="button"
              onClick={() => removeMember(member)}
              disabled={removingId === member.id}
              aria-label={`Remove ${member.member_email}`}
              title="Remove member"
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
