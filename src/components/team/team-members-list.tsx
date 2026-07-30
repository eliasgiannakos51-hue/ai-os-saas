import { Users, Clock, CheckCircle2 } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { formatRelativeTime } from "@/lib/format-time";

export type TeamMember = {
  id: string;
  member_email: string;
  status: "invited" | "active";
  invited_at: string;
  joined_at: string | null;
};

export function TeamMembersList({ members }: { members: TeamMember[] }) {
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
          <span
            className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium ${
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
        </div>
      ))}
    </div>
  );
}
