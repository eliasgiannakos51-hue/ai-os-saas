// Freeform notes/documents — a Notion-lite text editor, not an AI-generated
// artifact like the Build modules (no credit cost, no AI call). content is
// jsonb so the shape can grow later (e.g. blocks) without a migration;
// today it's just { html: string } from the contentEditable editor.
export type DocumentContent = { html: string };

export type UserDocument = {
  id: string;
  user_id: string;
  title: string;
  content: DocumentContent;
  created_at: string;
  updated_at: string;
};
