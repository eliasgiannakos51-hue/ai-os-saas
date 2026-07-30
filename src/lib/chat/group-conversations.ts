import type { ChatConversation } from "@/types/chat";

export type ConversationGroup = {
  label: "Today" | "Yesterday" | "Older";
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
    { label: "Today" as const, conversations: today },
    { label: "Yesterday" as const, conversations: yesterday },
    { label: "Older" as const, conversations: older },
  ].filter((group) => group.conversations.length > 0);
}
