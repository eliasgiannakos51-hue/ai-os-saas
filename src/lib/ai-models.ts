// Model identifiers, in a client-safe module on purpose.
//
// The cost estimate the Website Builder shows before submit runs in the
// browser, but it has to price the SAME model the server will actually
// call. Importing that name from lib/website-builder.ts is impossible —
// that file is `server-only` — and hardcoding a second copy of the string
// in the component is exactly how the preview silently starts pricing a
// model the app no longer uses.
export const WEBSITE_BUILDER_MODEL = "claude-sonnet-4-6";

// The model Ionexa Chat requests (api/chat/route.ts) — shared with
// lib/billing/free-chat.ts, whose whole job is pricing the free-chat
// envelope for THIS model. When these were two separate string constants,
// upgrading the chat model in the route silently left the free-chat
// economics computing against the old, cheaper model — and the 25% ceiling
// they guarantee stopped meaning anything.
export const CHAT_MODEL = "claude-sonnet-4-6";
