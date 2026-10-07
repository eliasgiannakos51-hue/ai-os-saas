#!/usr/bin/env node
/*
 * CAN image-studio.test.mjs SEE THE IMAGE TOOL TAKE MONEY FOR NOTHING, OR
 * SHOW SOMEBODY ELSE'S PICTURE?
 *
 * Four charged when three were made; a hold kept when nothing was made; a
 * failed change charged; a row written after the charge; the largest size
 * charged twice; a change that loses the picture it replaced; a route
 * without its owner filter, its switch, its claim or its rate limit; a
 * deletion that leaves pictures behind; a public bucket; the provider's
 * refusal read as an outage; four identical asks; a price off the
 * settlement's formula; a screen that sends without a key.
 *
 * Run: node scripts/tests/image-studio.mutation.mjs
 */
import { runMutations } from "./lib/mutation-runner.mjs";

const GATE = "scripts/tests/image-studio.test.mjs";
const GENERATE = "src/app/api/images/generate/route.ts";
const EDIT = "src/app/api/images/[id]/edit/route.ts";
const FULL = "src/app/api/images/[id]/full/route.ts";
const DOWNLOAD = "src/app/api/images/[id]/download/route.ts";
const DELETE = "src/app/api/images/[id]/route.ts";
const REMAKE = "src/lib/images/image-remake.ts";
const ACCESS = "src/lib/images/image-access.ts";
const ANSWER = "src/lib/images/image-answer.ts";
const STUDIO = "src/lib/images/image-studio.ts";
const PRICING = "src/lib/images/image-pricing.ts";
const SHELL = "src/components/images/image-shell.tsx";
const MIGRATION = "supabase/migrations/20261019000000_generated_images.sql";

const MUTANTS = [
  {
    name: "four are charged when fewer were made",
    file: GENERATE,
    from: "    for (let i = 0; i < variants.length; i++) {",
    to: "    for (let i = 0; i < IMAGE_VARIANTS; i++) {",
    expect: "...only the pictures stored are charged",
  },
  {
    name: "nothing was made and the hold is kept",
    file: GENERATE,
    from: "    if (variants.length === 0) {\n      await releaseReservation(user.id, reservationId);\n",
    to: "    if (variants.length === 0) {\n",
    expect: "...none made: the hold goes back",
  },
  {
    name: "the row cannot be written, and the pictures and the hold are kept",
    file: GENERATE,
    from: "      await removePictures(variants.map((v) => v.path));\n      await releaseReservation(user.id, reservationId);\n      return refuse(\"save_failed\", 500);",
    to: "      return refuse(\"save_failed\", 500);",
    expect: "...the row is written before the charge",
  },
  {
    name: "a failed change keeps the hold",
    file: REMAKE,
    from: "    if (!outcome.ok) {\n      await releaseReservation(user.id, reservationId);\n",
    to: "    if (!outcome.ok) {\n",
    expect: "a change or a largest size: a failed call gives the hold back",
  },
  {
    name: "a change loses the picture it replaced",
    file: REMAKE,
    from: "previous: [...v.previous, v.path, ...(v.fullPath ? [v.fullPath] : [])]",
    to: "previous: v.previous",
    expect: "a change keeps the picture it replaced",
  },
  {
    name: "the largest size is made, and charged, every time it is asked for",
    file: FULL,
    from: "    if (variant.fullPath) {\n",
    to: "    if (false) {\n",
    expect: "the largest size is made once",
  },
  {
    name: "a change reads somebody else's image",
    file: EDIT,
    from: '      .eq("id", id)\n      .eq("user_id", user.id)\n',
    to: '      .eq("id", id)\n',
    expect: "edit: the row is the owner's",
  },
  {
    name: "a deleted image leaves its pictures in the bucket",
    file: DELETE,
    from: '    if (!(await removePictures(everyPath(readVariants(row.variants, user.id))))) return refuse("delete_failed", 502);\n',
    to: "",
    expect: "a deleted image takes every picture it names first",
  },
  {
    name: "the tool opens with the switch off",
    file: ACCESS,
    from: '  if (!(await isFeatureOn("image-studio", user))) return refuse("not_enabled", 403);\n',
    to: "",
    expect: "the switch is image-studio",
  },
  {
    name: "two changes at once both rewrite the row",
    file: EDIT,
    from: '    if (!(await claimImage(user.id, id))) return refuse("busy", 409);\n',
    to: "",
    expect: "one change at a time",
  },
  {
    name: "saving a picture mints addresses without limit",
    file: DOWNLOAD,
    from: '    const limited = await checkRateLimit({ scope: "image_download", identifier: user.id, maxAttempts: 240, windowMinutes: 60 });\n    if (!limited.allowed) return refuse("rate_limited", 429);\n',
    to: "",
    expect: "a saved picture: rate limited",
  },
  {
    name: "the provider declining for its safety rules is reported as an outage",
    file: ANSWER,
    from: '"SAFETY", "IMAGE_SAFETY", ',
    to: '"SAFETY", ',
    expect: "the provider declining is said as declined",
  },
  {
    name: "a stored row can name another person's picture",
    file: STUDIO,
    from: "(!ownerId || p.startsWith(`${ownerId}/`))",
    to: "true",
    expect: "a stored row is read defensively",
  },
  {
    name: "the four are asked the same way",
    file: STUDIO,
    from: "  const direction = VARIANT_DIRECTIONS[index % VARIANT_DIRECTIONS.length];",
    to: "  const direction = VARIANT_DIRECTIONS[0];",
    expect: "...each asked differently",
  },
  {
    name: "the price on the button leaves out the feature's margin",
    file: PRICING,
    from: "  const margin = resolveMarginFor(IMAGE_FEATURE, plan?.slug ?? null, config).margin;",
    to: "  const margin = config.marginMultiplier;",
    expect: "the price is the settlement's own formula",
  },
  {
    name: "the bucket is public",
    file: MIGRATION,
    from: "values ('ai-images', 'ai-images', false, 52428800)",
    to: "values ('ai-images', 'ai-images', true, 52428800)",
    expect: "the bucket is private",
  },
  {
    name: "without the key the screen sends anyway",
    file: SHELL,
    from: '    if (!configured) {\n      say("tool", t("notConfigured"));\n      return;\n    }\n',
    to: "",
    expect: "without the provider's key it says so",
  },
];

runMutations({
  name: "image-studio",
  gate: GATE,
  targets: [GENERATE, EDIT, FULL, DOWNLOAD, DELETE, REMAKE, ACCESS, ANSWER, STUDIO, PRICING, SHELL, MIGRATION],
  mutants: MUTANTS,
});
