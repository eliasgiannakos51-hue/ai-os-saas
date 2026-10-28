"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Upload } from "lucide-react";
import { useToast } from "@/components/toast/toast-context";
import { uploadFile } from "@/lib/files/upload-file";
import { useFilesFailureWords } from "@/components/files/failure-words";
import { MAX_FILE_BYTES, formatBytes } from "@/lib/files/file-types";
import type { WorkspaceFile } from "@/lib/files/answer";

/**
 * «1. MY STUFF: ΝΕΑ ΟΘΟΝΗ», Κομμάτι 5 (2026-10-28): "ανέβασμα κάθε τύπου
 * αρχείου + όριο αποθήκευσης ανά πλάνο" — every file type, held to the
 * same per-plan storage quota as every other file.
 *
 * NOT A NEW QUOTA. lib/files/limits.ts already enforces a hard, per-plan
 * file-count and storage-byte ceiling — built for the Files tool, read
 * here unchanged via the same /api/files (GET for the usage line) and
 * /api/files/register + /api/files/upload (for the bytes). The only new
 * thing is `anyType: true` (lib/files/ingest.ts, lib/files/file-types.ts):
 * every other caller of this same pipeline still refuses a type it
 * cannot read; this is the one that does not, because My Stuff's own
 * promise is to hold the file, not to read it. The uploaded row lands in
 * user_files exactly like a Files-tool upload, which is why it appears
 * in My Stuff's own list (kind "file") with no change to Κομμάτι 1-4.
 */
export function MyStuffUpload({ onUploaded }: { onUploaded: () => void }) {
  const t = useTranslations("dashboard.myStuff.upload");
  const tFiles = useTranslations("dashboard.files");
  const failures = useFilesFailureWords();
  const { addToast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [usage, setUsage] = useState<{ storageBytes: number; storageCap: number | null } | null>(null);

  async function loadUsage() {
    try {
      const res = await fetch("/api/files");
      const data = (await res.json().catch(() => null)) as
        | { ok?: boolean; usage?: { storageBytes: number; storageCap: number | null } }
        | null;
      if (data?.ok && data.usage) setUsage({ storageBytes: data.usage.storageBytes, storageCap: data.usage.storageCap });
    } catch {
      // Left as whatever it was — a failed read is not "zero used".
    }
  }

  // Shown as soon as this row mounts — the owner's own pairing of
  // "upload" with "a quota" (Κομμάτι 5) means the number is read BEFORE
  // a press, not revealed only once someone tries.
  useEffect(() => {
    void loadUsage();
  }, []);

  async function uploadOne(file: File) {
    if (file.size === 0) {
      addToast(tFiles("emptyFile", { name: file.name }), "error");
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      addToast(tFiles("tooLarge", { name: file.name, max: formatBytes(MAX_FILE_BYTES) }), "error");
      return;
    }
    const outcome = await uploadFile(
      file,
      {
        error: tFiles("uploadError"),
        storageMissing: tFiles("uploadStorageMissing"),
        storagePolicy: tFiles("uploadStoragePolicy"),
        tooLargeForTransfer: tFiles("tooLargeForTransfer"),
        refused: (refusal) => failures.refused(refusal, file.name),
      },
      { anyType: true }
    );
    if (!outcome.ok) {
      addToast(outcome.error, "error");
      return;
    }
    const uploaded = outcome.file as WorkspaceFile;
    if (uploaded.processing_status === "failed") {
      addToast(failures.unreadable(uploaded.error, tFiles("uploadUnreadable", { name: file.name })), "error");
    } else {
      addToast(tFiles("uploadSuccess", { name: uploaded.filename }));
    }
    onUploaded();
    void loadUsage();
  }

  async function uploadMany(list: FileList | null) {
    if (!list || list.length === 0) return;
    setBusy(true);
    try {
      // Sequentially, same reason as the Files tool: extraction is
      // CPU-bound per file, and firing ten at once is how a folder drop
      // turns into a timeout rather than ten uploads.
      for (const file of Array.from(list)) {
        await uploadOne(file);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className={`mx-3 mb-2 flex items-center justify-between gap-2 rounded-item border border-dashed px-3 py-2 text-xs ${
        dragOver ? "border-foreground bg-panel" : "border-divider"
      }`}
      data-testid="my-stuff-upload"
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        void uploadMany(e.dataTransfer.files);
      }}
    >
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        data-testid="my-stuff-upload-button"
        className="flex min-h-[44px] items-center gap-1.5 rounded-item px-2 text-muted hover:bg-panel-hover hover:text-foreground disabled:opacity-40"
      >
        <Upload className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        {busy ? t("uploading") : t("button")}
      </button>
      {usage && (
        <span className="shrink-0 text-muted" data-testid="my-stuff-upload-usage">
          {usage.storageCap === null
            ? formatBytes(usage.storageBytes)
            : tFiles("storage", { used: formatBytes(usage.storageBytes), cap: formatBytes(usage.storageCap) })}
        </span>
      )}
      <input
        ref={inputRef}
        type="file"
        multiple
        hidden
        data-testid="my-stuff-upload-input"
        onChange={(e) => {
          void uploadMany(e.target.files);
          e.target.value = "";
        }}
      />
    </div>
  );
}
