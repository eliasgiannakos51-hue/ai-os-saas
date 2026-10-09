#!/usr/bin/env node
/*
 * CAN posts-images.test.mjs SEE A PICTURE AT THE WRONG SIZE, A SUBJECT CUT
 * OFF, A PHOTO TAKEN ON ITS SIDE, SOMEBODY ELSE'S PHOTO, OR A CREDIT LEFT
 * OFF?
 *
 * Instagram given LinkedIn's size, the centre kept instead of the subject,
 * the EXIF turn skipped, a path from another folder taken, the switch never
 * asked, the set read without its owner, the photographer's credit dropped,
 * a stored picture from any host, a failed run leaving the photo behind.
 *
 * Run: node scripts/tests/posts-images.mutation.mjs
 */
import { runMutations } from "./lib/mutation-runner.mjs";

const GATE = "scripts/tests/posts-images.test.mjs";
const SIZES = "src/lib/posts/post-images.ts";
const SERVER = "src/lib/posts/post-image-server.ts";
const PLATFORMS = "src/lib/posts/platforms.ts";
const GENERATE = "src/app/api/posts/generate/route.ts";
const IMAGE = "src/app/api/posts/[id]/image/route.ts";
const SHELL = "src/components/posts/posts-shell.tsx";

const MUTANTS = [
  {
    name: "Instagram is given a landscape size",
    file: SIZES,
    from: "  instagram: { width: 1080, height: 1350 },",
    to: "  instagram: { width: 1200, height: 630 },",
    expect: "every platform has its own published size",
  },
  {
    name: "the cut keeps the centre, not the subject",
    file: SERVER,
    from: 'fit: "cover", position: sharp.strategy.attention',
    to: 'fit: "cover", position: "centre"',
    expect: "the portrait cut keeps the subject at the edge",
  },
  {
    name: "a photo taken on its side is cut on its side",
    file: SERVER,
    from: "  return sharp(source)\n    .rotate()\n",
    to: "  return sharp(source)\n",
    expect: "a photo taken on its side is turned upright first",
  },
  {
    name: "the picture is stretched to the size instead of filling it",
    file: SERVER,
    from: 'fit: "cover", position: sharp.strategy.attention',
    to: 'fit: "inside"',
    expect: "exactly 1080 x 1350",
  },
  {
    name: "a stored path that climbs out is kept",
    file: SIZES,
    from: '    return path && !path.includes("..") ? { kind: "own", path } : null;',
    to: '    return path ? { kind: "own", path } : null;',
    expect: "...and a path that climbs out is refused",
  },
  {
    name: "a stored picture from any host is kept",
    file: SIZES,
    from: "    if (!/^https:\\/\\/images\\.unsplash\\.com\\//.test(url)) return null;\n",
    to: "",
    expect: "...and only from Unsplash's own image host",
  },
  {
    name: "a stored set drops its picture",
    file: PLATFORMS,
    from: "  return image ? { ...verdict.set, image } : verdict.set;",
    to: "  return verdict.set;",
    expect: "a stored set keeps its picture",
  },
  {
    name: "the generate route takes a photo from anybody's folder",
    file: GENERATE,
    from: "  if (ownPath && !ownPath.startsWith(`${user.id}/`)) return NextResponse.json({ error: \"bad_image_path\" }, { status: 400 });",
    to: "",
    expect: "a photo from outside the person's own folder is refused",
  },
  {
    name: "the generate route never asks the switch",
    file: GENERATE,
    from: '  if (pictureSource !== "none" && !(await isFeatureOn("posts-images", user))) {',
    to: "  if (false) {",
    expect: "a picture asked for without the switch is refused",
  },
  {
    name: "the picture route reads the set without its owner",
    file: IMAGE,
    from: '      .eq("id", params.id)\n      .eq("user_id", user.id)',
    to: '      .eq("id", params.id)',
    expect: "...reads the set with the person's own session, by id AND owner",
  },
  {
    name: "the picture route cuts a photo from anybody's folder",
    file: IMAGE,
    from: '    if (set.image.kind === "own" && !set.image.path.startsWith(`${user.id}/`)) return NextResponse.json({ ok: false, code: "not_found" }, { status: 404 });',
    to: "",
    expect: "...cuts only a photo from the person's own folder",
  },
  {
    name: "a picture viewed is not bounded",
    file: IMAGE,
    from: "    if (!cuts.allowed) return",
    to: "    if (false) return",
    expect: "every picture asked for is bounded, a view as much as a download",
  },
  {
    name: "a download is not bounded",
    file: IMAGE,
    from: "    if (download && !(await allowExport(user.id)))",
    to: "    if (false)",
    expect: "a download is bounded like every export",
  },
  {
    name: "the photographer's credit is left off",
    file: SHELL,
    from: '              {t.rich("picture.credit", {',
    to: '              {t.rich("picture.option", {',
    expect: "an Unsplash photo names its photographer and Unsplash",
  },
  {
    name: "a failed run leaves the photo behind",
    file: SHELL,
    from: "      if (!response.ok) {\n        await discardUpload();",
    to: "      if (!response.ok) {",
    expect: "...and removed again when no posts come back to hold it",
  },
  {
    name: "the «+» is offered whatever the choice",
    file: SHELL,
    from: '        pictures && pictureSource === "own"\n          ? { accept: ACCEPTED_ATTACHMENT_IMAGE_TYPES.join(","), label: t("picture.attach"), onFiles: addOwnPhoto }',
    to: '        pictures\n          ? { accept: ACCEPTED_ATTACHMENT_IMAGE_TYPES.join(","), label: t("picture.attach"), onFiles: addOwnPhoto }',
    expect: "the field's «+» is there only for the person's own photo",
  },
  {
    name: "the picture list stays open over the send button",
    file: SHELL,
    from: "                          onClick={() => setChoosing(null)}\n",
    to: "",
    expect: "a press on the choice already made closes the list",
  },
];

runMutations({ name: "posts-images", gate: GATE, targets: [SIZES, SERVER, PLATFORMS, GENERATE, IMAGE, SHELL], mutants: MUTANTS });
