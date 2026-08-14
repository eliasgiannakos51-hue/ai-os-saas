"use client";

import { useState, type ChangeEvent } from "react";
import { Wand2, Languages, Sparkles, HelpCircle, Check, X, Loader2 } from "lucide-react";
import { getErrorMessage } from "@/lib/get-error-message";
import { useTranslations } from "next-intl";
import { useErrorText, useErrorTextForStatus } from "@/lib/errors/use-error-text";
import { useCredits } from "@/components/credits/credits-context";

const ACTIONS = [
  { id: "rewrite", label: "Rewrite", icon: Wand2 },
  { id: "translate", label: "Translate", icon: Languages },
  { id: "improve", label: "Improve", icon: Sparkles },
  { id: "explain", label: "Explain", icon: HelpCircle },
] as const;

type ActionId = (typeof ACTIONS)[number]["id"];

// Drop-in replacement for a plain <textarea> that adds a small selection
// toolbar: highlight some text, pick Rewrite/Translate/Improve/Explain, and
// the AI's result appears below with Accept (splices it into the value,
// replacing exactly the selected span) / Reject (discards it, no change).
// Anchored to the textarea's top-right corner rather than the exact
// selection's on-screen position — a real caret-position readout needs a
// mirror-div measurement trick; this is the simple version.
export function TextActionsTextarea({
  value,
  onChange,
  className,
  placeholder,
  required,
}: {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  placeholder?: string;
  required?: boolean;
}) {
  const tCommon = useTranslations("common");
  const describe = useErrorText();
  const describeStatus = useErrorTextForStatus();
  const { reportUsage } = useCredits();
  const [selection, setSelection] = useState<{ start: number; end: number; text: string } | null>(
    null
  );
  const [pendingAction, setPendingAction] = useState<ActionId | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleSelect(e: React.SyntheticEvent<HTMLTextAreaElement>) {
    const el = e.currentTarget;
    const { selectionStart, selectionEnd } = el;
    if (selectionStart === selectionEnd) {
      setSelection(null);
      return;
    }
    setSelection({
      start: selectionStart,
      end: selectionEnd,
      text: value.slice(selectionStart, selectionEnd),
    });
    setResult(null);
    setError(null);
  }

  function handleChange(e: ChangeEvent<HTMLTextAreaElement>) {
    onChange(e.target.value);
    setSelection(null);
    setResult(null);
    setError(null);
  }

  async function runAction(action: ActionId) {
    if (!selection) return;
    setPendingAction(action);
    setResult(null);
    setError(null);

    try {
      const res = await fetch("/api/text-actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, text: selection.text }),
      });
      const data = await res.json();

      if (!res.ok || !data.ok) {
        setError(describeStatus(res.status).text);
        return;
      }

      setResult(data.result);
      // This client never touched the credits context at all, so a text
      // action moved the balance with nothing in the UI reflecting it —
      // not even on the next navigation, since the counter is client
      // state seeded once by the dashboard layout.
      void reportUsage(data);
    } catch {
      setError(tCommon("networkError"));
    } finally {
      setPendingAction(null);
    }
  }

  function accept() {
    if (!selection || result === null) return;
    const next = value.slice(0, selection.start) + result + value.slice(selection.end);
    onChange(next);
    setSelection(null);
    setResult(null);
  }

  function reject() {
    setResult(null);
    setSelection(null);
  }

  return (
    <div className="relative">
      <textarea
        value={value}
        onChange={handleChange}
        onSelect={handleSelect}
        onBlur={() => {
          // Delay so a click on the toolbar itself isn't lost to the blur
          // closing the selection first.
          setTimeout(() => setSelection((s) => (result || pendingAction ? s : null)), 150);
        }}
        className={className}
        placeholder={placeholder}
        required={required}
      />

      {selection && (
        <div className="absolute right-2 top-2 z-10 flex items-center gap-0.5 rounded-lg border border-border bg-panel p-1 shadow-lg">
          {ACTIONS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => runAction(id)}
              disabled={pendingAction !== null}
              aria-label={label}
              title={label}
              className="flex h-7 w-7 items-center justify-center rounded-md text-muted transition-colors duration-150 hover:bg-orange-500/10 hover:text-orange-400 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {pendingAction === id ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Icon className="h-3.5 w-3.5" />
              )}
            </button>
          ))}
        </div>
      )}

      {(result || error) && (
        <div className="absolute inset-x-0 top-full z-10 mt-1 rounded-lg border border-border bg-panel p-2.5 text-xs shadow-lg">
          {error ? (
            <p className="text-red-400">{error}</p>
          ) : (
            <>
              <p className="max-h-24 overflow-y-auto whitespace-pre-wrap text-foreground/90">
                {result}
              </p>
              <div className="mt-2 flex items-center justify-end gap-1.5">
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={reject}
                  className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-muted transition-colors duration-150 hover:text-foreground"
                >
                  <X className="h-3 w-3" /> Reject
                </button>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={accept}
                  className="inline-flex items-center gap-1 rounded-md bg-orange-500 px-2 py-1 font-medium text-black transition-colors duration-150 hover:opacity-90"
                >
                  <Check className="h-3 w-3" /> Accept
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
