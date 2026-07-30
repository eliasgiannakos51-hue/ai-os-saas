export type ChatRole = "user" | "assistant";

export type ChatConversation = {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
};

export type ChatMessage = {
  id: string;
  conversation_id: string;
  role: ChatRole;
  content: string;
  created_at: string;
};
