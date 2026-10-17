"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowLeft, Download, FileCode2, FileText, X } from "lucide-react";
import { MessageContent } from "@/components/chat/message-content";
import { CodeBlock } from "@/components/coding/code-block";
import { CopyButton } from "@/components/ui/copy-button";
import type { WorkItem } from "@/lib/chat/work-area";

/**
 * THE WORK AREA BESIDE THE CONVERSATION (ΣΥΣΤΗΜΑ DESIGN §5, «ΠΕΡΙΟΧΗ
 * ΔΟΥΛΕΙΑΣ», Δ.2), behind the switch "chat-work-area".
 *
 * On a computer the screen splits: the conversation about 40% on the
 * left, this about 60% on the right, on the workspace surface. On a phone
 * it is the whole screen, with a button back to the conversation. One row
 * on top: the name, at most two tabs, and the actions — copy and download.
 * It opens and closes with one press; the card under the answer
 * (ResultCard below) opens it again.
 */
export function WorkArea({ item, onClose }: { item: WorkItem; onClose: () => void }) {
  const t = useTranslations("dashboard.chat.workArea");
  const hasCode = item.blocks.length > 0;
  const [tab, setTab] = useState<"text" | "code">(item.kind === "code" ? "code" : "text");
  useEffect(() => setTab(item.kind === "code" ? "code" : "text"), [item]);

  function download() {
    const url = URL.createObjectURL(new Blob([item.fileBody], { type: "text/plain;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = item.fileName;
    a.click();
    URL.revokeObjectURL(url);
  }

  const ACTION =
    "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-item text-muted transition-colors duration-150 hover:bg-panel-hover hover:text-foreground";

  return (
    <section
      aria-label={item.title || t("label")}
      data-testid="chat-work-area"
      className="fixed inset-0 z-[60] flex flex-col bg-workspace lg:static lg:z-auto lg:w-[60%] lg:shrink-0 lg:border-s lg:border-border"
    >
      <div className="flex items-center gap-1 px-2 py-1.5">
        <button type="button" onClick={onClose} aria-label={t("back")} data-testid="work-area-back" className={`${ACTION} lg:hidden`}>
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        </button>
        <p className="min-w-0 flex-1 break-words px-1 text-sm font-medium text-foreground">{item.title || t("label")}</p>
        {hasCode && (
          <div role="tablist" className="flex items-center gap-1">
            {(["text", "code"] as const).map((k) => (
              <button
                key={k}
                type="button"
                role="tab"
                aria-selected={tab === k}
                onClick={() => setTab(k)}
                data-testid={`work-area-tab-${k}`}
                className={`min-h-[44px] rounded-item px-3 text-xs transition-colors duration-150 ${
                  tab === k ? "bg-panel text-foreground" : "text-muted hover:text-foreground"
                }`}
              >
                {t(k === "text" ? "tabText" : "tabCode")}
              </button>
            ))}
          </div>
        )}
        <CopyButton text={item.fileBody} label={t("copy")} variant="icon" className={ACTION} data-testid="work-area-copy" />
        <button type="button" onClick={download} aria-label={t("download", { file: item.fileName })} data-testid="work-area-download" className={ACTION}>
          <Download className="h-4 w-4" aria-hidden="true" />
        </button>
        <button type="button" onClick={onClose} aria-label={t("close")} data-testid="work-area-close" className={`${ACTION} hidden lg:inline-flex`}>
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6">
        {tab === "code" && hasCode ? (
          <div className="space-y-4">
            {item.blocks.map((b, i) => (
              <CodeBlock key={i} code={b.code} language={b.language} />
            ))}
          </div>
        ) : (
          <MessageContent content={item.markdown} className="leading-relaxed text-body" />
        )}
      </div>
    </section>
  );
}

/**
 * THE SMALL CARD IN THE CONVERSATION that reopens the work area (§5: «Ό,τι
 * παράχθηκε φαίνεται και στη συνομιλία ως μικρή κάρτα που ξανανοίγει την
 * περιοχή δουλειάς»).
 */
export function ResultCard({ item, open, onOpen }: { item: WorkItem; open: boolean; onOpen: () => void }) {
  const t = useTranslations("dashboard.chat.workArea");
  const Icon = item.kind === "code" ? FileCode2 : FileText;
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-pressed={open}
      data-testid="result-card"
      className={`btn-outline mt-2 w-full max-w-sm gap-3 px-3 py-2 text-start ${open ? "bg-panel-hover" : ""}`}
    >
      <Icon className="h-5 w-5 shrink-0 text-muted" aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <span className="block break-words text-sm text-foreground">{item.title || t("label")}</span>
        <span className="block text-xs text-muted">{t(open ? "isOpen" : "open")}</span>
      </span>
    </button>
  );
}
