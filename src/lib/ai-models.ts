// Model identifiers, in a client-safe module on purpose.
//
// The cost estimate the Website Builder shows before submit runs in the
// browser, but it has to price the SAME model the server will actually
// call. Importing that name from lib/website-builder.ts is impossible —
// that file is `server-only` — and hardcoding a second copy of the string
// in the component is exactly how the preview silently starts pricing a
// model the app no longer uses.
// V3 model tiers: the Website Builder runs on PREMIUM by default and
// escalates to MAX for complex briefs — the selection rule lives in
// lib/ai/models.ts (selectWebsiteBuilderModel) and is shared verbatim by
// the browser estimate and the server call, which is the property this
// file has always existed to protect.
export { selectWebsiteBuilderModel } from "@/lib/ai/models";
import { DEFAULT_MODEL_PREMIUM } from "@/lib/ai/models";
export const WEBSITE_BUILDER_MODEL = DEFAULT_MODEL_PREMIUM;
