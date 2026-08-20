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
import { ArrowUp } from "lucide-react";
import { useTranslations } from "next-intl";

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
    initialText?: string;
    /** Extra lines rendered inside the form, under the box (the free-
     *  message counter, the large-message price). They re-render on THEIR
     *  changes, which are rare, not on keystrokes. */
    children?: React.ReactNode;
  }
>(function ChatComposer({ sending, onSend, initialText = "", children }, ref) {
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
    const text = input.trim();
    if (!text || sending) return;
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
          className="focus-glow max-h-[45vh] min-h-[60px] w-full resize-none overflow-y-auto rounded-2xl border border-border bg-panel px-4 py-3.5 pr-14 text-sm text-foreground outline-none placeholder:text-muted focus:border-orange-500/60"
          autoFocus
        />
        <button
          type="submit"
          disabled={sending || !input.trim()}
          aria-label={t("send")}
          className="absolute bottom-2 right-2 flex h-11 w-11 items-center justify-center rounded-full bg-orange-500 text-black transition-all duration-200 hover:opacity-90 hover:shadow-[0_0_16px_rgba(249,115,22,0.4)] disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
        >
          {sending ? (
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-black/30 border-t-black" />
          ) : (
            <ArrowUp className="h-4 w-4" />
          )}
        </button>
      </div>
      {children}
    </form>
  );
});
