import type { ChatConversation } from "@/types/chat";

/**
 * `label` is a KEY under dashboard.chat, not text.
 *
 * It used to be the literal "Today" / "Yesterday" / "Older", rendered
 * straight into the sidebar. Nothing could see it: it is a data field, so
 * the JSX scanners walk past it, and it never appears in messages/*.json,
 * so check-i18n.js has nothing to compare. Three English headers sat at
 * the top of every Greek conversation list.
 */
export type ConversationGroup = {
  label: "groupToday" | "groupYesterday" | "groupOlder";
  conversations: ChatConversation[];
};

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

// Buckets by created_at (when the conversation was started), not
// updated_at — a conversation started yesterday and continued today still
// reads as "Yesterday" in the list, matching how ChatGPT/Claude.ai group
// threads.
export function groupConversationsByDate(
  conversations: ChatConversation[]
): ConversationGroup[] {
  const todayStart = startOfDay(new Date());
  const yesterdayStart = todayStart - 24 * 60 * 60 * 1000;

  const today: ChatConversation[] = [];
  const yesterday: ChatConversation[] = [];
  const older: ChatConversation[] = [];

  for (const conversation of conversations) {
    const createdDay = startOfDay(new Date(conversation.created_at));
    if (createdDay === todayStart) today.push(conversation);
    else if (createdDay === yesterdayStart) yesterday.push(conversation);
    else older.push(conversation);
  }

  return [
    { label: "groupToday" as const, conversations: today },
    { label: "groupYesterday" as const, conversations: yesterday },
    { label: "groupOlder" as const, conversations: older },
  ].filter((group) => group.conversations.length > 0);
}
