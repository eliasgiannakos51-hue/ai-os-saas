import { MAX_ATTACHMENT_IMAGES } from "@/lib/create-attachment-image";

/**
 * WHAT IS ATTACHED TO A CHAT MESSAGE (MASTER 16, package 9), as the
 * browser sends it, the route checks it, and the row keeps it
 * (chat_messages.attachments, migration 20261018000000). Client-safe: the
 * screen draws the same shape it sent.
 *
 * A PDF is a row of user_files — uploaded through the Files upload
 * (lib/files/upload-file.ts), so it is in Files and in the Library too —
 * and an image is a path in the create-attachments bucket, as Create and
 * Site attach them. Neither is copied anywhere else.
 */
export type ChatAttachment =
  | { kind: "pdf"; fileId: string; name: string }
  | { kind: "image"; path: string; name: string };

/** PDFs one message may carry, beside MAX_ATTACHMENT_IMAGES images. */
export const MAX_CHAT_FILES = 3;
export { MAX_ATTACHMENT_IMAGES };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const name = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim().slice(0, 200) : null);

/**
 * The attachments a request names, or why they are refused. An image path
 * must be inside the sender's own folder: the bucket is keyed by user id,
 * and a path in somebody else's folder is a request to read their image.
 */
export function readChatAttachments(
  raw: unknown,
  userId: string
): { ok: true; list: ChatAttachment[] } | { ok: false; reason: "shape" | "tooMany" | "notYours" } {
  if (raw === undefined || raw === null) return { ok: true, list: [] };
  if (!Array.isArray(raw)) return { ok: false, reason: "shape" };
  const list: ChatAttachment[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") return { ok: false, reason: "shape" };
    const a = item as Record<string, unknown>;
    const n = name(a.name);
    if (!n) return { ok: false, reason: "shape" };
    if (a.kind === "pdf" && typeof a.fileId === "string" && UUID.test(a.fileId)) {
      list.push({ kind: "pdf", fileId: a.fileId, name: n });
    } else if (a.kind === "image" && typeof a.path === "string" && a.path.length <= 300) {
      if (!a.path.startsWith(`${userId}/`) || a.path.includes("..")) return { ok: false, reason: "notYours" };
      list.push({ kind: "image", path: a.path, name: n });
    } else {
      return { ok: false, reason: "shape" };
    }
  }
  if (list.filter((a) => a.kind === "pdf").length > MAX_CHAT_FILES) return { ok: false, reason: "tooMany" };
  if (list.filter((a) => a.kind === "image").length > MAX_ATTACHMENT_IMAGES) return { ok: false, reason: "tooMany" };
  return { ok: true, list };
}

/**
 * A stored row's attachments, read defensively: anything malformed is
 * dropped, never thrown. With `ownerId` (the route, reading history back
 * for the model) an image outside that person's folder is dropped too: a
 * row is the person's own to write, so what it says is checked again
 * rather than trusted because it was stored.
 */
export function parseStoredAttachments(raw: unknown, ownerId?: string): ChatAttachment[] {
  if (!Array.isArray(raw)) return [];
  const out: ChatAttachment[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const a = item as Record<string, unknown>;
    const n = name(a.name);
    if (!n) continue;
    if (a.kind === "pdf" && typeof a.fileId === "string" && UUID.test(a.fileId)) out.push({ kind: "pdf", fileId: a.fileId, name: n });
    else if (a.kind === "image" && typeof a.path === "string" && a.path.length <= 300) {
      if (ownerId !== undefined && (!a.path.startsWith(`${ownerId}/`) || a.path.includes(".."))) continue;
      out.push({ kind: "image", path: a.path, name: n });
    }
  }
  return out;
}

/**
 * What the conversation has had attached, newest last, within the caps: a
 * document attached two messages ago is still what "and on page 3?" is
 * about. The newest of each kind win when there are more than the cap.
 */
export function conversationAttachments(earlier: readonly ChatAttachment[][], current: readonly ChatAttachment[]): ChatAttachment[] {
  const all = [...earlier.flat(), ...current];
  const key = (a: ChatAttachment) => (a.kind === "pdf" ? `pdf:${a.fileId}` : `image:${a.path}`);
  const seen = new Set<string>();
  const unique: ChatAttachment[] = [];
  for (let i = all.length - 1; i >= 0; i--) {
    const k = key(all[i]);
    if (seen.has(k)) continue;
    seen.add(k);
    unique.unshift(all[i]);
  }
  const kept = new Set<ChatAttachment>([
    ...unique.filter((a) => a.kind === "pdf").slice(-MAX_CHAT_FILES),
    ...unique.filter((a) => a.kind === "image").slice(-MAX_ATTACHMENT_IMAGES),
  ]);
  return unique.filter((a) => kept.has(a));
}
