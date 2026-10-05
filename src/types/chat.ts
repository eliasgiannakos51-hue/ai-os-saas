export type ChatRole = "user" | "assistant";

export type ChatConversation = {
  id: string;
  title: string;
  is_pinned: boolean;
  created_at: string;
  updated_at: string;
  // Starred state, resolved from user_favorites at page load (it is not a
  // column on this table — favourites are one shared table across every
  // module, see lib/favoritable.ts). Pin and favourite are deliberately
  // different: pin orders THIS list, favourite surfaces the conversation
  // on /dashboard/favorites next to everything else the user starred.
  is_favorited: boolean;
};

export type ChatMessage = {
  id: string;
  conversation_id: string;
  role: ChatRole;
  content: string;
  created_at: string;
  /** Thumbs up (1) or down (-1) on an answer, null for none — the column
   *  20261016000000_chat_message_rating.sql adds. Absent on a row read
   *  before that migration ran. */
  rating?: number | null;
};
