/**
 * «ΕΞΑΓΩΓΗ ΟΛΩΝ»: ONE FILE WITH EVERYTHING A PERSON KEEPS HERE (MASTER
 * Μέρος 18 §2.4, «τα δεδομένα είναι του χρήστη»; docs/ACCEPTANCE.md Α49).
 *
 * The export used to be the account's rows as JSON
 * (src/app/api/account/export/route.ts): every table, but none of the
 * files a person uploaded, no site they could open, no game they could
 * play. Behind the switch `export-all`, the route hands back a .zip:
 *
 *   ionexa-data.json             the same rows as before, unchanged
 *   files/<bucket>/<path>        every stored file, read from Storage
 *   sites/<name>.html or .zip    each site as lib/websites/site-download.ts
 *                                downloads it: it opens outside Ionexa
 *   games/<title>.html           each game, as its own page, sealed as
 *                                it is served (lib/games/game-html.ts)
 *   apps/<title>.html            each app made with Rebuild, sealed as it
 *                                is downloaded (lib/rebuild/rebuild-html.ts)
 *
 * The files are the ones the account deletion removes, found by the same
 * listing (lib/account/erase-storage.ts listUserFiles): what we would
 * erase is what we hand back. A function has one response and limited
 * memory, so the files are capped (EXPORT_FILES_MAX_BYTES, _MAX_COUNT);
 * whatever does not fit is NAMED in the data file with the reason, never
 * dropped in silence.
 *
 * Held by scripts/tests/export-archive.test.mjs, which reads the archive
 * back with an independent parser (src/lib/files/zip.ts).
 */
import { listUserFiles, type BucketApi } from "@/lib/account/erase-storage";
import { sealGame } from "@/lib/games/game-html";
import { sealApp } from "@/lib/rebuild/rebuild-html";
import { siteDownload } from "@/lib/websites/site-download";
import { zipStore } from "@/lib/websites/zip-store";

/** The files' total in one archive. The route's function holds the whole
 *  archive in memory before it answers, beside everything else it does. */
export const EXPORT_FILES_MAX_BYTES = 100 * 1024 * 1024;
/** Files in one archive. zipStore writes no Zip64 records, so the format
 *  itself stops at 65,535 entries; this is far below it. */
export const EXPORT_FILES_MAX_COUNT = 2000;

type Downloaded = Blob | ArrayBuffer | Uint8Array;
/** The two calls of `supabase.storage.from(bucket)` the export needs. */
export type ExportStorage = {
  from(bucket: string): Pick<BucketApi, "list"> & {
    download(path: string): Promise<{ data: Downloaded | null; error: unknown }>;
  };
};

export type ExportFile = { bucket: string; path: string; data: Uint8Array };
export type FileLeftOut = { bucket: string; path: string; reason: "size" | "count" | "unreadable" };

async function bytesOf(data: Downloaded): Promise<Uint8Array> {
  if (data instanceof Uint8Array) return data;
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  return new Uint8Array(await data.arrayBuffer());
}

/** Every stored file of `userId`, read through Storage, within the caps. */
export async function collectExportFiles(
  storage: ExportStorage,
  userId: string,
  limits: { maxBytes: number; maxCount: number } = { maxBytes: EXPORT_FILES_MAX_BYTES, maxCount: EXPORT_FILES_MAX_COUNT }
): Promise<{ included: ExportFile[]; left: FileLeftOut[]; bytes: number }> {
  const listed = await listUserFiles(storage, userId);
  const included: ExportFile[] = [];
  const left: FileLeftOut[] = [];
  let bytes = 0;
  for (const file of listed) {
    if (included.length >= limits.maxCount) {
      left.push({ ...file, reason: "count" });
      continue;
    }
    const { data, error } = await storage.from(file.bucket).download(file.path);
    if (error || !data) {
      left.push({ ...file, reason: "unreadable" });
      continue;
    }
    const body = await bytesOf(data);
    if (bytes + body.length > limits.maxBytes) {
      left.push({ ...file, reason: "size" });
      continue;
    }
    bytes += body.length;
    included.push({ ...file, data: body });
  }
  return { included, left, bytes };
}

/**
 * A name inside the archive that cannot step outside the folder it is
 * unpacked into: no empty, "." or ".." segment, no backslash, no leading
 * slash. Storage keys and site or game titles are the person's own text.
 */
export function safeEntryName(...parts: string[]): string {
  const segments = parts
    .join("/")
    .replace(/\\/g, "/")
    .split("/")
    .map((s) => s.replace(/[\u0000-\u001f]/g, "").trim())
    .filter((s) => s !== "" && s !== "." && s !== "..");
  return segments.join("/") || "file";
}

/** `name`, or `name (2)`, `name (3)`… when an earlier entry took it. */
function unique(name: string, taken: Set<string>): string {
  if (!taken.has(name)) {
    taken.add(name);
    return name;
  }
  const dot = name.lastIndexOf(".");
  const [stem, ext] = dot > name.lastIndexOf("/") ? [name.slice(0, dot), name.slice(dot)] : [name, ""];
  for (let n = 2; ; n++) {
    const next = `${stem} (${n})${ext}`;
    if (!taken.has(next)) {
      taken.add(next);
      return next;
    }
  }
}

const titleOf = (raw: string | null | undefined, fallback: string) =>
  (raw ?? "").replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 80) || fallback;

/** The archive itself: the data file, then files, sites and games. */
export function buildExportArchive(input: {
  data: unknown;
  userId: string;
  files: readonly ExportFile[];
  sites: readonly { name: string; html_content: string | null; pages?: unknown }[];
  games: readonly { title: string; html: string | null }[];
  /** Apps made with Rebuild; absent for a caller that has none to hand over. */
  apps?: readonly { title: string; html: string | null }[];
}): Uint8Array {
  const enc = new TextEncoder();
  const taken = new Set<string>();
  const entries: { name: string; data: Uint8Array }[] = [];
  const add = (name: string, data: Uint8Array) => entries.push({ name: unique(name, taken), data });

  add("ionexa-data.json", enc.encode(JSON.stringify(input.data, null, 2)));
  for (const f of input.files) {
    // The key starts with the person's own id; the folder is theirs, the
    // id adds nothing to a file they unpack at home.
    const rest = f.path.startsWith(`${input.userId}/`) ? f.path.slice(input.userId.length + 1) : f.path;
    add(safeEntryName("files", f.bucket, rest), f.data);
  }
  for (const site of input.sites) {
    if (!site.html_content) continue;
    const file = siteDownload({ name: titleOf(site.name, "site"), html_content: site.html_content, pages: site.pages });
    add(safeEntryName("sites", file.filename), file.data);
  }
  for (const game of input.games) {
    if (!game.html) continue;
    add(safeEntryName("games", `${titleOf(game.title, "game")}.html`), enc.encode(sealGame(game.html)));
  }
  for (const app of input.apps ?? []) {
    if (!app.html) continue;
    add(safeEntryName("apps", `${titleOf(app.title, "app")}.html`), enc.encode(sealApp(app.html)));
  }
  return zipStore(entries);
}
