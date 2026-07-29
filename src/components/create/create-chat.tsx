"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { NAV_ITEMS } from "@/lib/modules";

type Result =
  | { type: "matched"; moduleTitle: string; href: string; message: string }
  | { type: "unmatched"; message: string }
  | { type: "error"; message: string };

export function CreateChat() {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const isModK = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k";
      if (!isModK) return;
      e.preventDefault();
      textareaRef.current?.focus();
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const message = input.trim();
    if (!message) return;

    setLoading(true);
    setResult(null);

    try {
      const res = await fetch("/api/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });
      const data = await res.json();

      if (!res.ok || !data.ok) {
        setResult({ type: "error", message: data.error ?? "Something went wrong." });
      } else if (data.matched) {
        setResult({
          type: "matched",
          moduleTitle: data.moduleTitle,
          href: data.href,
          message: data.message,
        });
        setInput("");
      } else {
        setResult({ type: "unmatched", message: data.message });
        setInput("");
      }
    } catch {
      setResult({ type: "error", message: "Network error — please try again." });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full max-w-2xl">
      <div className="mb-8 text-center">
        <p className="text-sm tracking-widest text-amber-500">Nexa AI //</p>
        <h1 className="mt-1 text-2xl font-bold text-foreground">
          create_anything()
        </h1>
        <p className="mt-2 text-sm text-muted">
          Describe anything — a product idea, a trade, feedback from a user,
          a metric — and it lands in the right module automatically.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="describe what you want to create or log..."
          rows={4}
          className="input min-h-32 text-base"
          autoFocus
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="inline-flex min-h-[44px] w-full items-center justify-center rounded bg-amber-500 px-4 py-3 text-sm font-semibold text-black transition-all duration-200 hover:opacity-90 hover:shadow-[0_0_16px_rgba(245,158,11,0.35)] disabled:opacity-50"
        >
          {loading ? "thinking..." : "run create()"}
        </button>
      </form>

      {result && (
        <div className="mt-6">
          {result.type === "matched" && (
            <div className="rounded-md border border-emerald-800 bg-emerald-950/20 p-4 text-sm">
              <p className="text-emerald-400">
                Καταγράφηκε στο module:{" "}
                <span className="font-semibold">{result.moduleTitle}</span>
              </p>
              <p className="mt-1 text-foreground/90">{result.message}</p>
              <Link
                href={result.href}
                className="mt-3 inline-flex min-h-[44px] items-center justify-center rounded border border-emerald-800 px-3 py-1.5 text-xs text-emerald-400 transition-colors hover:border-emerald-500 sm:min-h-0"
              >
                view {result.moduleTitle.toLowerCase()} →
              </Link>
            </div>
          )}

          {result.type === "unmatched" && (
            <div className="rounded-md border border-amber-800 bg-amber-950/20 p-4 text-sm">
              <p className="text-foreground/90">{result.message}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {NAV_ITEMS.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="inline-flex min-h-[44px] items-center justify-center rounded border border-border px-3 py-1 text-xs text-muted transition-colors hover:border-amber-500 hover:text-amber-400 sm:min-h-0 sm:px-2"
                  >
                    {item.label.toLowerCase()}
                  </Link>
                ))}
              </div>
            </div>
          )}

          {result.type === "error" && (
            <div className="rounded border border-red-900 bg-red-950/40 px-3 py-2 text-xs text-red-400">
              error: {result.message}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
