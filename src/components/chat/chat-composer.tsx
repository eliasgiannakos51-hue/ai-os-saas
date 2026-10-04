"use client";

import {
  forwardRef,
  useImperativeHandle,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { ArrowUp, Square } from "lucide-react";
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
  }
>(function ChatComposer({ sending, onSend, onStop, initialText = "", children }, ref) {
  const t = useTranslations("dashboard.chat");
  const [input, setInput] = useState(initialText);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function resize(el: HTMLTextAreaElement) {
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }

  useImperativeHandle(ref, () => ({
    setText: (text: string) => {
      setInput(text);
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
    if (!text) return;
    setInput("");
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
      <div className="relative">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          placeholder={t("composerPlaceholder")}
          rows={1}
          // max-h-40 (160px) was the whole complaint: a long message scrolled
          // inside a box a quarter the height of the thread above it. A
          // viewport-relative cap grows with the screen instead of
          // pinning the composer to one small absolute size.
          // THE SAME FIELD AS HOME'S (docs/CONTEXT.md, «ΣΥΝΟΜΙΛΙΑ»: «Το
          // πεδίο μένει κάτω, ίδιο με της αρχικής»): the controls sit on
          // a row under the text — voice bottom-left, send bottom-right —
          // so the text has the full width and never runs under a button.
          className="focus-glow max-h-[45vh] min-h-[6.5rem] w-full resize-none overflow-y-auto rounded-field border border-border bg-panel px-4 pb-14 pt-3.5 text-sm text-foreground outline-none placeholder:text-muted focus:border-foreground/60"
          autoFocus
        />
        {/* THE MICROPHONE SITS BESIDE THE BOX, NEVER INSTEAD OF IT, and
            what it produces lands in the textarea for the user to read
            and fix — it does not send. Renders nothing at all when the
            deployment has no transcription provider or the plan does not
            include voice (components/voice/voice-input.tsx). */}
        <div className="absolute bottom-2 start-2">
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
            disabled={sending || !input.trim()}
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
