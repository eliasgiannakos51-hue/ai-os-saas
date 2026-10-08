"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { ChevronDown, Clock, FileDown, PenLine, Plus } from "lucide-react";
import { useToast } from "@/components/toast/toast-context";
import { ThinkingIndicator } from "@/components/ui/thinking-indicator";
import { saveFileResponse } from "@/components/ui/download-pdf-button";
import { CostEstimateHint, useCostEstimate } from "@/components/credits/cost-estimate";
import { ToolShell, ChosenBox, OPTION, ACTION, workIsBeside, type ShellTurn } from "@/components/shell/tool-shell";
import { DocumentPdfButton } from "@/components/documents/document-pdf-button";
import { TranslateButton } from "@/components/translate/translate-button";
import type { ChatComposerHandle } from "@/components/chat/chat-composer";
import type { PdfBlock } from "@/lib/pdf/blocks";
import {
  DOC_KINDS,
  MAX_DOC_DESCRIPTION_CHARS,
  MAX_DOC_INSTRUCTION_CHARS,
  blockText,
  docEditEstimateInputChars,
  docEstimateInputChars,
  type DocKind,
} from "@/lib/documents/writer";

export type WrittenDocRow = { id: string; title: string; blocks: PdfBlock[]; updatedAt: string };
type Open = { id: string; title: string; blocks: PdfBlock[] };

/**
 * DOCUMENT IN THE SHELL (MASTER 16, package 14), behind the switch
 * "document-writer": «παίρνω έγγραφο από περιγραφή, αλλάζω μία παράγραφο με
 * λόγια, και το κατεβάζω σε Word και PDF».
 *
 * The first thing said in the field writes a document
 * (/api/documents/generate); while one is open, what is said next changes
 * it (/api/documents/[id]/edit) — the whole of it, or, with a box pressed,
 * that paragraph alone. The document opens beside the conversation as its
 * blocks, with Word, PDF and the editor on top. Three options under the
 * field: what kind of document, what was written before, a new one.
 */
export function DocumentsShell({ initialOpenId = null, docs, translate = false }: { initialOpenId?: string | null; docs: WrittenDocRow[]; /** The switch "translate" (package 28). */ translate?: boolean }) {
  const t = useTranslations("dashboard.documents.writer");
  const tShell = useTranslations("dashboard.toolShell");
  const tNames = useTranslations("dashboard.tools.names");
  const tSteps = useTranslations("aiSteps");
  const locale = useLocale();
  const router = useRouter();
  const { addToast } = useToast();
  const composerRef = useRef<ChatComposerHandle>(null);
  const abortRef = useRef<AbortController | null>(null);

  const [kind, setKind] = useState<DocKind>("free");
  const [choosing, setChoosing] = useState(false);
  const [length, setLength] = useState(0);
  const [running, setRunning] = useState(false);
  const [turns, setTurns] = useState<{ id: string; role: "user" | "tool"; text: string; doc?: Open }[]>([]);
  const [open, setOpenDoc] = useState<Open | null>(() => {
    const asked = initialOpenId ? docs.find((d) => d.id === initialOpenId) : undefined;
    return asked ? { id: asked.id, title: asked.title, blocks: asked.blocks } : null;
  });
  const [box, setBox] = useState<number | null>(null);
  const [pane, setPane] = useState<"doc" | "recent" | null>(() => (open ? "doc" : null));
  const [exporting, setExporting] = useState(false);
  const setOpen = (next: Open | null) => {
    setOpenDoc(next);
    setBox(null);
  };

  const editing = Boolean(open);
  const estimate = useCostEstimate("documentGenerate", { inputChars: docEstimateInputChars(length) });
  const editEstimate = useCostEstimate(box === null ? "documentEdit" : "documentBlockEdit", { inputChars: open ? docEditEstimateInputChars(open.blocks, length) : 0 });

  // Literal keys, so the message slicer can bound them.
  const kindNames: Record<DocKind, string> = useMemo(
    () => ({
      free: t("kinds.free"),
      offer: t("kinds.offer"),
      letter: t("kinds.letter"),
      cv: t("kinds.cv"),
      report: t("kinds.report"),
      invoice: t("kinds.invoice"),
      script: t("kinds.script"),
    }),
    [t]
  );

  function say(role: "user" | "tool", text: string, doc?: Open) {
    setTurns((prev) => [...prev, { id: `${role}${prev.length}`, role, text, doc }]);
  }

  function refusal(code: string): string {
    switch (code) {
      case "too_short": return t("errors.tooShort");
      case "too_long": return t("errors.tooLong");
      case "insufficient_credits": return t("errors.insufficient");
      case "rate_limited": return t("errors.rateLimited");
      case "ai_unavailable":
      case "not_configured": return t("errors.unavailable");
      case "unusable": return t("errors.unusable");
      case "not_included": return t("errors.notIncluded");
      case "not_saved": return t("errors.notSaved");
      case "bad_block": return tShell("box.lost");
      default: return t("errors.failed");
    }
  }

  async function write(description: string) {
    if (running) return;
    say("user", description);
    setRunning(true);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const response = await fetch("/api/documents/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({ description: description.slice(0, MAX_DOC_DESCRIPTION_CHARS), kind, locale }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok || !body?.ok) {
        say("tool", refusal(String(body?.code ?? "")));
        return;
      }
      const made: Open = { id: String(body.id), title: String(body.title), blocks: body.blocks as PdfBlock[] };
      say("tool", t("done", { title: made.title }), made);
      setOpen(made);
      setPane("doc");
      router.refresh();
    } catch {
      say("tool", controller.signal.aborted ? tSteps("stopped") : t("errors.failed"));
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setRunning(false);
    }
  }

  async function change(instruction: string) {
    if (running || !open) return;
    say("user", instruction);
    setRunning(true);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const response = await fetch(`/api/documents/${open.id}/edit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({ instruction: instruction.slice(0, MAX_DOC_INSTRUCTION_CHARS), ...(box === null ? {} : { blockIndex: box }) }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok || !body?.ok) {
        say("tool", refusal(String(body?.code ?? "")));
        return;
      }
      const changed: Open = { id: open.id, title: String(body.title), blocks: body.blocks as PdfBlock[] };
      say("tool", box === null ? t("changed") : t("blockChanged", { n: box + 1 }), changed);
      // The same box stays chosen: the next words are usually about it.
      setOpenDoc(changed);
      setPane("doc");
      router.refresh();
    } catch {
      say("tool", controller.signal.aborted ? tSteps("stopped") : t("errors.failed"));
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setRunning(false);
    }
  }

  async function exportDocx(id: string) {
    if (exporting) return;
    setExporting(true);
    try {
      const res = await fetch(`/api/documents/${id}/docx`);
      if (!res.ok) {
        addToast(t("errors.exportFailed"), "error");
        return;
      }
      saveFileResponse(await res.blob(), res, "document.docx");
    } catch {
      addToast(t("errors.exportFailed"), "error");
    } finally {
      setExporting(false);
    }
  }

  const shellTurns: ShellTurn[] = turns.map((turn) =>
    turn.doc
      ? {
          id: turn.id,
          role: turn.role,
          text: turn.text,
          card: {
            title: turn.doc.title,
            open: pane === "doc" && open?.id === turn.doc.id,
            onOpen: () => {
              setOpen(turn.doc!);
              setPane("doc");
            },
          },
        }
      : { id: turn.id, role: turn.role, text: turn.text }
  );

  const work =
    pane === "doc" && open
      ? {
          title: open.title,
          actions: (
            <>
              <button type="button" onClick={() => exportDocx(open.id)} disabled={exporting} aria-label={t("word")} title={t("word")} data-testid="document-docx" className={ACTION}>
                <FileDown className="h-4 w-4" aria-hidden="true" />
              </button>
              <DocumentPdfButton documentId={open.id} />
              {translate && <TranslateButton kind="document" id={open.id} actionClassName={ACTION} openHref={(id) => `/dashboard/documents/${id}`} />}
              <Link href={`/dashboard/documents/${open.id}`} aria-label={t("openEditor")} title={t("openEditor")} data-testid="document-open-editor" className={ACTION}>
                <PenLine className="h-4 w-4" aria-hidden="true" />
              </Link>
            </>
          ),
          body: (
            <>
              <p className="mb-3 text-xs text-muted">{t("boxHint")}</p>
              <ol className="space-y-2">
                {open.blocks.map((block, index) => (
                  <li key={index}>
                    <button
                      type="button"
                      onClick={() => {
                        if (block.kind === "rule") return;
                        setBox((v) => (v === index ? null : index));
                        if (!workIsBeside()) setPane(null);
                        composerRef.current?.focus();
                      }}
                      aria-pressed={box === index}
                      data-testid="doc-box"
                      data-kind={block.kind}
                      className={`block min-h-[44px] w-full rounded-item px-3 py-2 text-start ${box === index ? "bg-panel-hover ring-1 ring-foreground" : "hover:bg-panel-hover"}`}
                    >
                      {block.kind === "heading" ? (
                        <span className={`block font-semibold text-foreground ${block.level === 1 ? "text-lg" : "text-base"}`}>{blockText(block).replace(/\*/g, "")}</span>
                      ) : block.kind === "listItem" ? (
                        <span className="flex gap-2 text-sm text-body">
                          <span className="text-muted">{block.marker}</span>
                          <span>{block.runs.map((r) => r.text).join("")}</span>
                        </span>
                      ) : block.kind === "rule" ? (
                        <span className="block h-px bg-border" />
                      ) : (
                        <span className="block text-sm leading-relaxed text-body">{block.runs.map((r) => r.text).join("")}</span>
                      )}
                    </button>
                  </li>
                ))}
              </ol>
            </>
          ),
        }
      : pane === "recent"
        ? {
            title: t("recent"),
            body:
              docs.length === 0 ? (
                <p className="text-xs text-muted">{t("noneYet")}</p>
              ) : (
                <ul className="row-list">
                  {docs.map((row) => (
                    <li key={row.id} className="py-2">
                      <button
                        type="button"
                        onClick={() => {
                          setOpen({ id: row.id, title: row.title, blocks: row.blocks });
                          setPane("doc");
                        }}
                        className="min-h-[44px] w-full text-start"
                      >
                        <p className="break-words text-sm text-foreground">{row.title}</p>
                        <p className="text-[11px] text-muted">{new Date(row.updatedAt).toLocaleDateString(locale)}</p>
                      </button>
                    </li>
                  ))}
                </ul>
              ),
          }
        : null;

  return (
    <ToolShell
      ref={composerRef}
      name={tNames("document")}
      turns={shellTurns}
      working={
        running ? (
          <span className="inline-flex items-center gap-2 text-xs text-muted">
            <ThinkingIndicator size="sm" />
            {editing ? t("changing") : t("writing")}
          </span>
        ) : null
      }
      placeholder={editing && box !== null ? tShell("box.placeholder", { name: t("block", { n: box + 1 }) }) : editing ? t("changePlaceholder") : t("placeholder")}
      sending={running}
      onSend={(text) => void (editing ? change(text) : write(text))}
      onStop={() => abortRef.current?.abort()}
      onLengthChange={setLength}
      options={[
        <span key="kind" className="relative">
          <button type="button" onClick={() => setChoosing((v) => !v)} aria-expanded={choosing} disabled={editing} data-testid="document-kind" className={`${OPTION} disabled:opacity-40`}>
            {kindNames[kind]}
            <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
          {choosing && (
            <div role="listbox" aria-label={t("kind")} className="surface absolute bottom-full start-0 z-10 mb-2 w-56 space-y-1">
              {DOC_KINDS.map((k) => (
                <button
                  key={k}
                  type="button"
                  role="option"
                  aria-selected={k === kind}
                  onClick={() => {
                    setKind(k);
                    setChoosing(false);
                  }}
                  className={`block min-h-[44px] w-full rounded-item px-2 text-start text-sm ${k === kind ? "bg-panel-hover text-foreground" : "text-muted hover:text-foreground"}`}
                >
                  {kindNames[k]}
                </button>
              ))}
            </div>
          )}
        </span>,
        <button key="recent" type="button" onClick={() => setPane((v) => (v === "recent" ? null : "recent"))} aria-pressed={pane === "recent"} data-testid="document-recent" className={OPTION}>
          <Clock className="h-3.5 w-3.5" aria-hidden="true" />
          {t("recent")}
        </button>,
        <button
          key="new"
          type="button"
          onClick={() => {
            setOpen(null);
            setPane(null);
            composerRef.current?.focus();
          }}
          disabled={!open}
          data-testid="document-new"
          className={`${OPTION} disabled:opacity-40`}
        >
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          {t("new")}
        </button>,
      ]}
      footer={
        <>
          {editing && box !== null && <ChosenBox label={t("block", { n: box + 1 })} onClear={() => setBox(null)} />}
          {!running && length > 0 ? <CostEstimateHint credits={editing ? editEstimate.credits : estimate.credits} /> : null}
        </>
      }
      work={work}
      onCloseWork={() => setPane(null)}
    />
  );
}
