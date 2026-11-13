"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { ChevronDown, FileDown, PenLine } from "lucide-react";
import { useToast } from "@/components/toast/toast-context";
import { ThinkingIndicator } from "@/components/ui/thinking-indicator";
import { saveFileResponse } from "@/components/ui/download-pdf-button";
import { CostEstimateHint, useCostEstimate } from "@/components/credits/cost-estimate";
import { ToolShell, ChosenBox, OPTION, ACTION, workIsBeside, type ShellTurn } from "@/components/shell/tool-shell";
import { useEditorShell } from "@/components/shell/editor-shell-context";
import { ShellHistoryColumn } from "@/components/shell/shell-history-column";
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
export function DocumentsShell({
  initialOpenId = null,
  docs,
  translate = false,
  initialText,
}: {
  initialOpenId?: string | null;
  docs: WrittenDocRow[];
  /** The switch "translate" (package 28). */
  translate?: boolean;
  /** A quick-job tile's example text, dropped into the field unsent (lib/nav/quick-jobs.ts). */
  initialText?: string;
}) {
  const t = useTranslations("dashboard.documents.writer");
  // The approved editor layout (the switch "editor-shell"): the Word file
  // is the bar's one white button there, instead of an icon among the rest.
  const editor = useEditorShell();
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
  const [pane, setPane] = useState<"doc" | null>(() => (open ? "doc" : null));
  const [exporting, setExporting] = useState(false);
  const setOpen = (next: Open | null) => {
    setOpenDoc(next);
    setBox(null);
  };
  // THE [◧] COLUMN, remembered per device — same key shape as
  // Chat's own (components/chat/chat-workspace.tsx, components/chat/conversation-column.tsx).
  const [historyOpen, setHistoryOpen] = useState(false);
  useEffect(() => {
    try {
      setHistoryOpen(window.localStorage.getItem("ionexa.documentsHistoryColumn") === "open");
    } catch {
      /* private window or storage off: closed, which is the default */
    }
  }, []);
  function toggleHistory() {
    setHistoryOpen((isOpen) => {
      const next = !isOpen;
      try {
        window.localStorage.setItem("ionexa.documentsHistoryColumn", next ? "open" : "closed");
      } catch {
        /* nothing to persist to; the toggle still works for this visit */
      }
      return next;
    });
  }

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

  // THE EDITOR LAYOUT'S TAG (the switch "editor-shell", 11-Document.png):
  // what the screen knows for certain about the open document — how many
  // words it has, counted as the reader's language divides words
  // (Intl.Segmenter), so a Chinese or Japanese document is not one "word"
  // per paragraph.
  const wordCount = useMemo(() => {
    if (!editor || !open) return null;
    const text = open.blocks.map((block) => (block.kind === "rule" ? "" : blockText(block))).join(" ");
    const segmenter = typeof Intl !== "undefined" && "Segmenter" in Intl ? new Intl.Segmenter(locale, { granularity: "word" }) : null;
    if (!segmenter) return text.split(/\s+/).filter(Boolean).length;
    let n = 0;
    for (const piece of segmenter.segment(text)) if (piece.isWordLike) n++;
    return n;
  }, [editor, open, locale]);

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
          status: wordCount === null ? undefined : t("words", { count: wordCount }),
          primary: { label: t("word"), icon: <FileDown className="h-4 w-4" aria-hidden="true" />, onClick: () => void exportDocx(open.id), disabled: exporting, busy: exporting },
          actions: (
            <>
              {!editor && (
              <button type="button" onClick={() => exportDocx(open.id)} disabled={exporting} aria-label={t("word")} title={t("word")} data-testid="document-docx" className={ACTION}>
                <FileDown className="h-4 w-4" aria-hidden="true" />
              </button>
              )}
              <DocumentPdfButton documentId={open.id} />
              {translate && <TranslateButton kind="document" id={open.id} actionClassName={ACTION} openHref={(id) => `/dashboard/documents/${id}`} />}
              <Link href={`/dashboard/documents/${open.id}`} aria-label={t("openEditor")} title={t("openEditor")} data-testid="document-open-editor" className={ACTION}>
                <PenLine className="h-4 w-4" aria-hidden="true" />
              </Link>
            </>
          ),
          body: (
            // THE PAGE, CENTRED ON THE STAGE in the editor layout
            // (11-Document.png, `.paper`: at most 740px, white, the ink on
            // it); the blocks as they always were under the old shell.
            <div data-testid="doc-page" className={editor ? "doc-paper" : undefined}>
              <p className={`mb-3 text-xs ${editor ? "text-button-ink/70" : "text-muted"}`}>{t("boxHint")}</p>
              <ol className="space-y-2">
                {open.blocks.map((block, index) => (
                  <li key={index} className={editor ? "relative" : undefined}>
                    {/* THE SELECTED PARAGRAPH'S LABEL (11-Document.png,
                        the editor layout only): the same "<name> ·
                        selected" text the Site picker draws over its box
                        (tShell("editor.selectedTag")), placed above this
                        paragraph instead, since there is no sandboxed
                        iframe here to post it into — the block IS the
                        page's own DOM. */}
                    {editor && box === index && block.kind !== "rule" && (
                      <span
                        data-testid="doc-box-selected-label"
                        className="absolute -top-2.5 start-3 rounded-full bg-button-ink px-2 py-0.5 text-[11px] font-semibold leading-none text-paper"
                      >
                        {tShell("editor.selectedTag", { name: t("block", { n: index + 1 }) })}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={(event) => {
                        if (block.kind === "rule") return;
                        setBox((v) => (v === index ? null : index));
                        // In the editor layout the field is under the page
                        // on a phone too, so the page stays; and the field
                        // is focused only from the keyboard (detail 0), so
                        // a press does not draw its ring or open a phone's
                        // keyboard over the page.
                        if (!editor && !workIsBeside()) setPane(null);
                        if (!editor || event.detail === 0) composerRef.current?.focus();
                      }}
                      aria-pressed={box === index}
                      data-testid="doc-box"
                      data-kind={block.kind}
                      className={
                        editor
                          ? `block min-h-[44px] w-full rounded-item px-3 py-2 text-start ${box === index ? "bg-button-ink/5 ring-2 ring-button-ink" : "hover:bg-button-ink/5"}`
                          : `block min-h-[44px] w-full rounded-item px-3 py-2 text-start ${box === index ? "bg-panel-hover ring-1 ring-foreground" : "hover:bg-panel-hover"}`
                      }
                    >
                      {block.kind === "heading" ? (
                        <span className={`block font-semibold ${editor ? "text-button-ink" : "text-foreground"} ${block.level === 1 ? "text-lg" : "text-base"}`}>{blockText(block).replace(/\*/g, "")}</span>
                      ) : block.kind === "listItem" ? (
                        <span className={`flex gap-2 text-sm ${editor ? "text-button-ink" : "text-body"}`}>
                          <span className={editor ? "text-button-ink/70" : "text-muted"}>{block.marker}</span>
                          <span>{block.runs.map((r) => r.text).join("")}</span>
                        </span>
                      ) : block.kind === "rule" ? (
                        <span className={`block h-px ${editor ? "bg-button-ink/15" : "bg-border"}`} />
                      ) : (
                        <span className={`block text-sm leading-relaxed ${editor ? "text-button-ink" : "text-body"}`}>{block.runs.map((r) => r.text).join("")}</span>
                      )}
                    </button>
                  </li>
                ))}
              </ol>
            </div>
          ),
        }
      : null;

  return (
    <ToolShell
      ref={composerRef}
      name={tNames("document")}
      initialText={initialText}
      turns={shellTurns}
      working={
        running ? (
          <span className="inline-flex items-center gap-2 text-xs text-muted">
            <ThinkingIndicator size="sm" />
            {editing ? t("changing") : t("writing")}
          </span>
        ) : null
      }
      placeholder={editing && box !== null ? (editor ? tShell("editor.changeThis") : tShell("box.placeholder", { name: t("block", { n: box + 1 }) })) : editing ? t("changePlaceholder") : t("placeholder")}
      sending={running}
      onSend={(text) => void (editing ? change(text) : write(text))}
      onStop={() => abortRef.current?.abort()}
      onLengthChange={setLength}
      // Once a document is open its kind is fixed (the option is disabled
      // then), so in the editor layout it leaves the field, which is then
      // the approved one row (11-Document.png). It comes back with «New».
      options={editor && editing ? [] : [
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
      ]}
      empty={{
        heading: t("empty.heading"),
        examples: [
          { key: "offer", label: t("empty.examples.offer") },
          { key: "cv", label: t("empty.examples.cv") },
          { key: "letter", label: t("empty.examples.letter") },
        ],
      }}
      history={{
        open: historyOpen,
        onToggle: toggleHistory,
        onNew: () => {
          setOpen(null);
          setPane(null);
          composerRef.current?.focus();
        },
        newLabel: t("new"),
        column: (
          <ShellHistoryColumn
            rows={docs.map((row) => ({ id: row.id, title: row.title }))}
            activeId={open?.id ?? null}
            onOpen={(id) => {
              const row = docs.find((d) => d.id === id);
              if (!row) return;
              setOpen({ id: row.id, title: row.title, blocks: row.blocks });
              setPane("doc");
            }}
            onNavigate={() => {
              if (typeof window !== "undefined" && window.innerWidth < 768) toggleHistory();
            }}
          />
        ),
      }}
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
