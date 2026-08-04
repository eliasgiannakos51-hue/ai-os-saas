// Model identifiers, in a client-safe module on purpose.
//
// The cost estimate the Website Builder shows before submit runs in the
// browser, but it has to price the SAME model the server will actually
// call. Importing that name from lib/website-builder.ts is impossible —
// that file is `server-only` — and hardcoding a second copy of the string
// in the component is exactly how the preview silently starts pricing a
// model the app no longer uses.
export const WEBSITE_BUILDER_MODEL = "claude-sonnet-4-6";
