"use client";

import {
  forwardRef,
  useImperativeHandle,
  useRef,
  useState,
  type ChangeEvent,
  type ClipboardEvent,
  type DragEvent,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import Link from "next/link";
import { ArrowUp, LayoutGrid, Paperclip, Square } from "lucide-react";
import { useTranslations } from "next-intl";
import { ThinkingIndicator } from "@/components/ui/thinking-indicator";
import { VoiceInput } from "@/components/voice/voice-input";

/**
 * The chat's text box, owning its own keystrokes.
 *
 * WHAT WAS REPORTED. "When I type there is a visible delay before the
 * letters appear." Measured (input-latency.prodtest.mjs, Event Timing
 * API): with a 40-message thread open, p50 was 128ms and p95 192ms per
 * keystroke — because `input` lived in ChatWorkspace, so every letter
 * re-rendered the ENTIRE workspace: the thread, the sidebar, the header.
 * The memoised message bubbles skipped their markdown re-parse but the
 * reconciliation of the whole tree still ran, per key.
 *
 * Moving the input state HERE means a keystroke re-renders this component
 * alone. The parent gets the text exactly once, on send. For the two
 * places that need to write INTO the box from outside (the example
 * prompts on the empty screen, the mentor prefill), the parent uses the
 * imperative handle rather than owning the value — the classic
 * uncontrolled-with-a-handle trade, chosen deliberately: those writes
 * happen once per click, keystrokes happen constantly.
 */
export type ChatComposerHandle = {
  setText: (text: string) => void;
  focus: () => void;
};

export const ChatComposer = forwardRef<
  ChatComposerHandle,
  {
    sending: boolean;
    onSend: (text: string) => void;
    /** THE STOP BUTTON — V4.6. While a reply streams, the send button
     *  becomes this: one press aborts the request, keeps what has
     *  arrived, and hands the box back at once. The server charges only
     *  what was produced (api/chat/route.ts). */
    onStop?: () => void;
    initialText?: string;
    /** Extra lines rendered inside the form, under the box (the free-
     *  message counter, the large-message price). They re-render on THEIR
     *  changes, which are rare, not on keystrokes. */
    children?: React.ReactNode;
    /** A button drawn inside the field, after the microphone — the
     *  voice conversation's, «δεύτερο κουμπί δίπλα στο μικρόφωνο»
     *  (docs/MASTER.md, Μέρος 13.2). Drawn by the parent, which knows
     *  whether it can start. */
    beside?: React.ReactNode;
    /** The box's placeholder; Chat's own when not given. The tool shell
     *  (components/shell/tool-shell.tsx) passes each tool's. */
    placeholder?: string;
    /** Called with the text's length on every keystroke, for a tool whose
     *  price depends on it (the estimate shown before sending). Chat does
     *  not pass it, so a keystroke there still re-renders this box alone. */
    onLengthChange?: (length: number) => void;
    /** Files given to the message (package 9): the «+» beside the grid,
     *  and files pasted into the box or dropped on it. Drawn only when
     *  given — Chat passes it behind the switch "chat-attachments". */
    attach?: { accept: string; label: string; onFiles: (files: File[]) => void };
    /** What the message carries, drawn above the text (the chips). */
    tray?: React.ReactNode;
    /** Send waits: a file is still being read. Enter does nothing either. */
    holdSend?: boolean;
  }
>(function ChatComposer({ sending, onSend, onStop, initialText = "", children, beside, placeholder, onLengthChange, attach, tray, holdSend = false }, ref) {
  const t = useTranslations("dashboard.chat");
  const tRail = useTranslations("sidebar.rail");
  const [input, setInput] = useState(initialText);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  // A pasted screenshot or a file dropped on the field is the same as one
  // chosen with «+»; text pasted is still text.
  function takeFiles(list: FileList | null | undefined): boolean {
    const files = Array.from(list ?? []);
    if (!attach || files.length === 0) return false;
    attach.onFiles(files);
    return true;
  }
  function handlePaste(e: ClipboardEvent<HTMLTextAreaElement>) {
    if (takeFiles(e.clipboardData?.files)) e.preventDefault();
  }
  function handleDrop(e: DragEvent<HTMLDivElement>) {
    setDragging(false);
    if (takeFiles(e.dataTransfer?.files)) e.preventDefault();
  }

  function resize(el: HTMLTextAreaElement) {
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }

  useImperativeHandle(ref, () => ({
    setText: (text: string) => {
      setInput(text);
      onLengthChange?.(text.length);
      const el = textareaRef.current;
      if (el) {
        // The value lands on the next render; resize after it has.
        requestAnimationFrame(() => {
          if (textareaRef.current) resize(textareaRef.current);
        });
        el.focus();
      }
    },
    focus: () => textareaRef.current?.focus(),
  }));

  function handleInput(e: ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value);
    onLengthChange?.(e.target.value.length);
    resize(e.target);
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    // Enter while a reply streams is a stop, not a queued second send: the
    // person wants the box back, and the fastest way to say so is the key
    // they already have their hand on.
    if (sending) {
      onStop?.();
      return;
    }
    const text = input.trim();
    if (!text || holdSend) return;
    setInput("");
    onLengthChange?.(0);
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    onSend(text);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit(e as unknown as FormEvent);
    }
  }

  return (
    <form onSubmit={submit}>
      {tray}
      <div
        className="relative"
        onDragOver={attach ? (e) => { if (e.dataTransfer?.types?.includes("Files")) { e.preventDefault(); setDragging(true); } } : undefined}
        onDragLeave={attach ? () => setDragging(false) : undefined}
        onDrop={attach ? handleDrop : undefined}
      >
        <textarea
          ref={textareaRef}
          value={input}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          onPaste={attach ? handlePaste : undefined}
          placeholder={placeholder ?? t("composerPlaceholder")}
          rows={1}
          // max-h-40 (160px) was the whole complaint: a long message scrolled
          // inside a box a quarter the height of the thread above it. A
          // viewport-relative cap grows with the screen instead of
          // pinning the composer to one small absolute size.
          // THE SAME FIELD AS HOME'S (docs/CONTEXT.md, «ΣΥΝΟΜΙΛΙΑ»: «Το
          // πεδίο μένει κάτω, ίδιο με της αρχικής»): the controls sit on
          // a row under the text — voice bottom-left, send bottom-right —
          // so the text has the full width and never runs under a button.
          className={`focus-glow max-h-[45vh] min-h-[6.5rem] w-full resize-none overflow-y-auto rounded-field border bg-panel px-4 pb-14 pt-3.5 text-sm text-foreground outline-none placeholder:text-muted focus:border-foreground/60 ${dragging ? "border-foreground/60" : "border-border"}`}
          autoFocus
        />
        {/* THE MICROPHONE SITS BESIDE THE BOX, NEVER INSTEAD OF IT, and
            what it produces lands in the textarea for the user to read
            and fix — it does not send. Renders nothing at all when the
            deployment has no transcription provider or the plan does not
            include voice (components/voice/voice-input.tsx). */}
        {/* THE GRID THAT OPENS ALL TOOLS (ΣΥΣΤΗΜΑ DESIGN §5, «Πεδίο κάτω,
            ίδιο παντού»), before the microphone. A link, so it opens in a
            new tab like any other and needs nothing from this component.
            The «+» after it gives the message a PDF or an image (package
            9), when the screen passes `attach`. */}
        <div className="absolute bottom-2 start-2 flex items-center gap-1">
          <Link
            href="/dashboard/tools"
            aria-label={tRail("allTools")}
            title={tRail("allTools")}
            data-testid="composer-all-tools"
            className="flex h-11 w-11 items-center justify-center rounded-item text-muted transition-colors duration-150 hover:bg-panel-hover hover:text-foreground"
          >
            <LayoutGrid className="h-4 w-4" aria-hidden="true" />
          </Link>
          {attach && (
            <>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                aria-label={attach.label}
                title={attach.label}
                data-testid="composer-attach"
                className="flex h-11 w-11 items-center justify-center rounded-item text-muted transition-colors duration-150 hover:bg-panel-hover hover:text-foreground"
              >
                <Paperclip className="h-4 w-4" aria-hidden="true" />
              </button>
              <input
                ref={fileRef}
                type="file"
                accept={attach.accept}
                multiple
                className="sr-only"
                tabIndex={-1}
                aria-hidden="true"
                data-testid="composer-attach-input"
                onChange={(e) => {
                  takeFiles(e.target.files);
                  e.target.value = "";
                }}
              />
            </>
          )}
          <VoiceInput
            disabled={sending}
            onTranscript={(text) => {
              setInput((current) => (current.trim() ? `${current.trim()} ${text}` : text));
              const el = textareaRef.current;
              if (el) {
                requestAnimationFrame(() => {
                  if (textareaRef.current) {
                    resize(textareaRef.current);
                    textareaRef.current.focus();
                  }
                });
              }
            }}
          />
          {beside}
        </div>
        {sending && onStop ? (
          <button
            type="button"
            onClick={onStop}
            aria-label={t("stop")}
            title={t("stop")}
            data-testid="chat-stop"
            className="absolute bottom-2 end-2 flex h-11 w-11 items-center justify-center rounded-full border border-foreground/60 bg-panel text-foreground transition-all duration-200 hover:bg-foreground/15"
          >
            <Square className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
          </button>
        ) : (
          <button
            type="submit"
            disabled={sending || holdSend || !input.trim()}
            aria-label={t("send")}
            className="absolute bottom-2 end-2 flex h-11 w-11 items-center justify-center rounded-full bg-button text-button-ink transition-all duration-200 hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {sending ? (
              <ThinkingIndicator size="sm" tone="inherit" />
            ) : (
              <ArrowUp className="h-4 w-4" />
            )}
          </button>
        )}
      </div>
      {children}
    </form>
  );
});
