"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Brain, FileText, ImageIcon, X } from "lucide-react";
import { ThinkingIndicator } from "@/components/ui/thinking-indicator";
import { admitFiles, attachPdf, chatImageUrl, uploadChatImages, type AttachKind, type AttachRefusal } from "@/lib/chat/attach-client";
import { MAX_ATTACHMENT_IMAGES, MAX_CHAT_FILES, type ChatAttachment } from "@/lib/chat/attachment-types";
import type { MemoryUsed } from "@/lib/chat/memory-citations";

/**
 * WHAT A CHAT MESSAGE CARRIES, ON THE SCREEN (MASTER 16, package 9).
 *
 * useChatAttachments owns the tray under the field: a PDF is read by
 * Files as soon as it is chosen, so its chip says "reading", then its
 * pages, or why it could not be read; an image waits on the page and goes
 * up with the message (lib/chat/attach-client.ts says why). Send waits
 * while a file is being read or a failed one is still on the tray — a
 * question about a document that silently went without it would be
 * answered as if there were none.
 *
 * SentAttachments draws them again on the message they went with, also
 * after a reload; MemoriesUsed lists, under an answer, the remembered
 * facts it said it used. Held by scripts/tests/chat-attachments.test.mjs.
 */

export type TrayItem = {
  key: string;
  kind: AttachKind;
  name: string;
  state: "reading" | "ready" | "failed";
  error?: string;
  /** A PDF, once Files has read it. */
  attachment?: ChatAttachment;
  pages?: number | null;
  /** An image, until the message goes. */
  file?: File;
  preview?: string;
};

let trayCounter = 0;

export function useChatAttachments(onRefused: (lines: string[]) => void) {
  const t = useTranslations("dashboard.chat.attach");
  const tFiles = useTranslations("dashboard.files");
  const [items, setItems] = useState<TrayItem[]>([]);
  const itemsRef = useRef(items);
  itemsRef.current = items;

  const update = (key: string, patch: Partial<TrayItem>) =>
    setItems((current) => current.map((item) => (item.key === key ? { ...item, ...patch } : item)));

  function refusalLine(name: string, why: AttachRefusal): string {
    if (why === "tooManyPdfs") return t("tooManyPdfs", { max: MAX_CHAT_FILES });
    if (why === "tooManyImages") return t("tooManyImages", { max: MAX_ATTACHMENT_IMAGES });
    if (why === "pdfTooLarge") return t("pdfTooLarge", { name });
    if (why === "imageTooLarge") return t("imageTooLarge", { name });
    return t("type", { name });
  }

  function add(files: File[]) {
    const live = itemsRef.current.filter((i) => i.state !== "failed");
    const { taken, refused } = admitFiles(files, {
      pdfs: live.filter((i) => i.kind === "pdf").length,
      images: live.filter((i) => i.kind === "image").length,
    });
    if (refused.length > 0) onRefused([...new Set(refused.map((r) => refusalLine(r.name, r.why)))]);
    const added: TrayItem[] = taken.map(({ file, kind }) => ({
      key: `attach-${++trayCounter}`,
      kind,
      name: file.name,
      state: kind === "pdf" ? "reading" : "ready",
      ...(kind === "image" ? { file, preview: URL.createObjectURL(file) } : {}),
    }));
    if (added.length === 0) return;
    setItems((current) => [...current, ...added]);
    taken.forEach(({ file, kind }, i) => {
      if (kind !== "pdf") return;
      const key = added[i].key;
      attachPdf(file, {
        error: tFiles("uploadError"),
        storageMissing: tFiles("uploadStorageMissing"),
        storagePolicy: tFiles("uploadStoragePolicy"),
        tooLargeForTransfer: tFiles("tooLargeForTransfer"),
        unreadable: t("unreadable", { name: file.name }),
      }).then(
        (outcome) =>
          outcome.ok
            ? update(key, { state: "ready", attachment: outcome.attachment, pages: outcome.pages })
            : update(key, { state: "failed", error: outcome.error }),
        () => update(key, { state: "failed", error: t("offline") })
      );
    });
  }

  function remove(key: string) {
    // A PDF taken off stays in Files, where it was put and where it can be
    // deleted; an image never left the page.
    setItems((current) => current.filter((item) => item.key !== key));
  }

  const reading = items.some((i) => i.state === "reading");
  const failed = items.some((i) => i.state === "failed");

  /**
   * The message's attachments, the images uploaded now. `previews` maps
   * each image's stored path to its on-page picture, for the message drawn
   * before the server answers.
   */
  async function prepare(): Promise<
    | { ok: true; attachments: ChatAttachment[]; imagePaths: string[]; previews: Record<string, string> }
    | { ok: false; error: string }
  > {
    const ready = itemsRef.current.filter((i) => i.state === "ready");
    const pdfs = ready.filter((i) => i.kind === "pdf" && i.attachment).map((i) => i.attachment!);
    const images = ready.filter((i) => i.kind === "image" && i.file);
    let uploaded: ChatAttachment[] = [];
    try {
      const outcome = await uploadChatImages(images.map((i) => ({ file: i.file!, name: i.name })));
      if (!outcome.ok) return { ok: false, error: t("imageUpload") };
      uploaded = outcome.attachments;
    } catch {
      return { ok: false, error: t("offline") };
    }
    const previews: Record<string, string> = {};
    uploaded.forEach((a, i) => {
      if (a.kind === "image" && images[i].preview) previews[a.path] = images[i].preview!;
    });
    return {
      ok: true,
      attachments: [...pdfs, ...uploaded],
      imagePaths: uploaded.flatMap((a) => (a.kind === "image" ? [a.path] : [])),
      previews,
    };
  }

  return {
    items,
    add,
    remove,
    prepare,
    clear: () => setItems([]),
    hold: reading || failed,
    holdReason: reading ? t("holdReading") : failed ? t("holdFailed") : null,
  };
}

export function AttachmentTray({ items, onRemove, holdReason }: { items: TrayItem[]; onRemove: (key: string) => void; holdReason: string | null }) {
  const t = useTranslations("dashboard.chat.attach");
  if (items.length === 0) return null;
  return (
    <div className="mb-2" data-testid="chat-attach-tray">
      <ul className="flex flex-wrap gap-2">
        {items.map((item) => (
          <li
            key={item.key}
            data-testid="chat-attach-chip"
            data-state={item.state}
            className={`flex min-h-[44px] max-w-full items-center gap-2 rounded-item bg-panel px-2 py-1 text-xs ${
              item.state === "failed" ? "text-danger" : "text-foreground"
            }`}
          >
            {item.kind === "image" && item.preview ? (
              // eslint-disable-next-line @next/next/no-img-element -- an on-page object URL, not an optimisable asset
              <img src={item.preview} alt="" className="h-8 w-8 shrink-0 rounded-item object-cover" />
            ) : (
              <FileText className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
            )}
            <span className="min-w-0">
              <span className="block max-w-[14rem] truncate">{item.name}</span>
              <span className="block text-[11px] text-muted" aria-live="polite">
                {item.state === "reading" ? (
                  <span className="inline-flex items-center gap-1">
                    <ThinkingIndicator size="sm" />
                    {t("reading")}
                  </span>
                ) : item.state === "failed" ? (
                  <span className="text-danger">{item.error}</span>
                ) : item.kind === "pdf" ? (
                  item.pages ? t("pages", { count: item.pages }) : t("readyPdf")
                ) : (
                  t("readyImage")
                )}
              </span>
            </span>
            <button
              type="button"
              onClick={() => onRemove(item.key)}
              aria-label={t("remove", { name: item.name })}
              data-testid="chat-attach-remove"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-item text-muted hover:bg-panel-hover hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
      {holdReason && (
        <p className="mt-1.5 text-[11px] text-muted" data-testid="chat-attach-hold">
          {holdReason}
        </p>
      )}
    </div>
  );
}

function SentImage({ path, name, preview }: { path: string; name: string; preview?: string }) {
  const [src, setSrc] = useState<string | null>(preview ?? null);
  const [gone, setGone] = useState(false);
  useEffect(() => {
    if (preview) return;
    let alive = true;
    void chatImageUrl(path).then((url) => {
      if (!alive) return;
      if (url) setSrc(url);
      else setGone(true);
    });
    return () => {
      alive = false;
    };
  }, [path, preview]);
  if (!src || gone) {
    return (
      <span className="inline-flex min-h-[44px] items-center gap-1.5 rounded-item bg-panel px-2 text-xs text-muted">
        <ImageIcon className="h-3.5 w-3.5" aria-hidden="true" />
        {name}
      </span>
    );
  }
  return (
    <a href={src} target="_blank" rel="noopener noreferrer" title={name} className="block">
      {/* eslint-disable-next-line @next/next/no-img-element -- a signed link to a private object */}
      <img src={src} alt={name} className="h-20 w-20 rounded-item object-cover" />
    </a>
  );
}

/** The attachments drawn on the message they went with. */
export function SentAttachments({ attachments, previews }: { attachments: ChatAttachment[] | undefined; previews?: Record<string, string> }) {
  const t = useTranslations("dashboard.chat.attach");
  if (!attachments || attachments.length === 0) return null;
  return (
    <ul className="mb-1.5 flex flex-wrap justify-end gap-2" data-testid="chat-sent-attachments">
      {attachments.map((a) =>
        a.kind === "pdf" ? (
          <li key={`pdf:${a.fileId}`}>
            <Link
              href={`/dashboard/files?record=${encodeURIComponent(a.fileId)}`}
              title={t("openInFiles")}
              className="inline-flex min-h-[44px] max-w-[16rem] items-center gap-1.5 rounded-item bg-panel px-2 text-xs text-foreground hover:bg-panel-hover"
            >
              <FileText className="h-3.5 w-3.5 shrink-0 text-muted" aria-hidden="true" />
              <span className="truncate">{a.name}</span>
            </Link>
          </li>
        ) : (
          <li key={`image:${a.path}`}>
            <SentImage path={a.path} name={a.name} preview={previews?.[a.path]} />
          </li>
        )
      )}
    </ul>
  );
}

/** «Από τη μνήμη (N)» under an answer: the remembered facts it said it used. */
export function MemoriesUsed({ memories }: { memories: MemoryUsed[] | undefined }) {
  const t = useTranslations("dashboard.chat.attach");
  if (!memories || memories.length === 0) return null;
  return (
    <details className="mt-2 border-t border-border/60 pt-2" data-testid="chat-memories-used">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 text-xs text-muted hover:text-foreground/80">
        <Brain className="h-3 w-3" aria-hidden="true" />
        {t("memoryUsed", { count: memories.length })}
      </summary>
      <ul className="mt-2 space-y-1">
        {memories.map((m, i) => (
          <li key={m.id ?? i} className="break-words text-xs text-muted">
            {m.text}
          </li>
        ))}
      </ul>
      <Link href="/dashboard/ai-memory" className="mt-2 inline-flex min-h-[44px] items-center text-xs text-muted underline decoration-dotted underline-offset-2 hover:text-foreground">
        {t("manageMemory")}
      </Link>
    </details>
  );
}
