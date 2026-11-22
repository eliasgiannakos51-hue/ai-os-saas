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

// A CHEAP MODEL FOR CLASSIFICATION: lead scoring, Greek spelling,
// content safety review, clarification detection — structured
// forced-tool-use calls with tiny output (128–500 tokens) where haiku
// is 12× cheaper than sonnet and accuracy is comparable.
// Add this after measuring haiku accuracy on each classifier (the
// Greek spelling check at lib/websites-greek-spelling-check.ts lines
// 48–60 documents the trade-off — haiku has NOT been measured for
// Greek orthography yet, so that one stays on sonnet until measured).
export const CLASSIFIER_MODEL = "claude-haiku-4-5";
