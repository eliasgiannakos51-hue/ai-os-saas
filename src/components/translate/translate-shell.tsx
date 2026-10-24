"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Check, ChevronDown, Plus, X } from "lucide-react";
import { ThinkingIndicator } from "@/components/ui/thinking-indicator";
import { CostEstimateHint } from "@/components/credits/cost-estimate";
import { useCredits } from "@/components/credits/credits-context";
import { ToolShell, ChosenBox, OPTION, type ShellTurn } from "@/components/shell/tool-shell";
import type { ChatComposerHandle } from "@/components/chat/chat-composer";
import { LANGUAGES } from "@/lib/languages";
import { estimateForAction } from "@/lib/billing/estimate";
import { DEFAULTS } from "@/lib/billing/pricing-config";
import { TRANSLATE_MODEL, TRANSLATE_STYLES, translateEditInputChars, type TranslateStyle } from "@/lib/translate/translate-prompt";
import { MAX_GLOSSARY_TERMS, MAX_TRANSLATE_TARGETS, splitParagraphs, translateTextLiveEstimateChars } from "@/lib/translate/text-source";

/**
 * TRANSLATE, AS ITS OWN TOOL (the owner's "ΛΕΙΤΟΥΡΓΙΚΟ, ΚΟΜΜΑΤΙ ΚΟΜΜΑΤΙ",
 * 2026-10-24, package 1-2), behind the switch "translate-tool".
 *
 * Paste text, pick up to five target languages and a register, and get
 * every paragraph back beside its original, for every language — one
 * price for the lot, shown before pressing send (api/translate/text:
 * mode "price" first, then "run"). Scoped text in this round; a file,
 * a site or a glossary are later pieces of the same build, each its own
 * check before the next starts.
 */
type ResultTarget = { target: string; paragraphs: string[]; kept: number; sameLanguage: boolean };
type Turn = { id: string; role: "user" | "tool"; text: string; from?: string; results?: ResultTarget[] };

function languageLabel(code: string): string {
  return LANGUAGES.find((l) => l.code === code)?.label ?? code;
}

export function TranslateShell() {
  const t = useTranslations("dashboard.translateTool");
  const tNames = useTranslations("dashboard.tools.names");
  const tSteps = useTranslations("aiSteps");
  const locale = useLocale();
  const { accountCreditPriceEur, planSlug, refresh: refreshCredits } = useCredits();
  const composerRef = useRef<ChatComposerHandle>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Literal keys, so the message-slices gate can bound this component
  // (scripts/tests/message-slices.test.mjs) — `t(\`style.${style}\`)` is
  // an unbounded key the same way documents-shell.tsx's `kindNames` note
  // explains.
  const styleNames: Record<TranslateStyle, string> = {
    formal: t("style.formal"),
    friendly: t("style.friendly"),
    source: t("style.source"),
  };
  const defaultTarget = locale === "en" ? "el" : "en";
  const [targets, setTargets] = useState<string[]>([defaultTarget]);
  const [style, setStyle] = useState<TranslateStyle>("source");
  const [choosingTargets, setChoosingTargets] = useState(false);
  const [choosingStyle, setChoosingStyle] = useState(false);
  const [length, setLength] = useState(0);
  const [running, setRunning] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  // ONE PARAGRAPH CHOSEN (package 3, ChosenBox — components/shell/tool-
  // shell.tsx, the same box Documents uses for its own paragraph edit):
  // which turn, which language and which paragraph the next words change.
  const [editing, setEditing] = useState<{ turnId: string; target: string; index: number } | null>(null);

  // THE GLOSSARY (package 4): one row, read once and written whole
  // (api/translate/glossary) — a term the account typed is this
  // account's own word, so a long name never has to make room for it,
  // the same reason the "Σύντομα" badge sits in its own corner.
  const [glossary, setGlossary] = useState<string[]>([]);
  const [suggestedBrand, setSuggestedBrand] = useState<string | null>(null);
  const [choosingGlossary, setChoosingGlossary] = useState(false);
  const [newTerm, setNewTerm] = useState("");
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/translate/glossary");
        const body = await res.json().catch(() => null);
        if (!cancelled && res.ok && body?.ok) {
          setGlossary(Array.isArray(body.terms) ? body.terms : []);
          setSuggestedBrand(typeof body.suggestedBrand === "string" ? body.suggestedBrand : null);
        }
      } catch {
        /* the glossary stays empty; translation still works without it */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function saveGlossary(terms: string[]) {
    setGlossary(terms);
    try {
      await fetch("/api/translate/glossary", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ terms }) });
    } catch {
      /* the field already shows the new list; a failed save is retried on the next edit */
    }
  }
  function addTerm(term: string) {
    const t = term.trim();
    if (!t || glossary.includes(t) || glossary.length >= MAX_GLOSSARY_TERMS) return;
    void saveGlossary([...glossary, t]);
    setSuggestedBrand((b) => (b === t ? null : b));
  }
  function removeTerm(term: string) {
    void saveGlossary(glossary.filter((g) => g !== term));
  }

  const editingParagraph = editing ? turns.find((t) => t.id === editing.turnId)?.results?.find((r) => r.target === editing.target)?.paragraphs[editing.index] : undefined;

  const estimate = useMemo(() => {
    if (editing && editingParagraph !== undefined) {
      const inputChars = translateEditInputChars(editing.target, editingParagraph, "x".repeat(length), style);
      return estimateForAction("textTranslateEdit", { model: TRANSLATE_MODEL, inputChars, planSlug }, DEFAULTS, accountCreditPriceEur ?? undefined);
    }
    const inputChars = translateTextLiveEstimateChars(length, targets.length);
    return estimateForAction(
      "documentTranslate",
      { model: TRANSLATE_MODEL, inputChars, planSlug },
      DEFAULTS,
      accountCreditPriceEur ?? undefined
    );
  }, [editing, editingParagraph, length, targets, style, planSlug, accountCreditPriceEur]);

  function say(role: "user" | "tool", text: string, extra?: Partial<Turn>) {
    setTurns((prev) => [...prev, { id: `${role}${prev.length}`, role, text, ...extra }]);
  }

  function refusal(code: string, detail?: { chars?: number; limit?: number; from?: string }): string {
    switch (code) {
      case "nothing_to_translate": return t("errors.nothing");
      case "too_long": return t("errors.tooLong", { chars: detail?.chars ?? 0, limit: detail?.limit ?? 0 });
      case "same_language": return t("errors.sameLanguage");
      case "insufficient_credits": return t("errors.insufficient");
      case "rate_limited": return t("errors.rateLimited");
      case "not_enabled":
      case "not_configured":
      case "ai_unavailable": return t("errors.unavailable");
      case "unusable": return t("errors.unusable");
      case "stopped": return tSteps("stopped");
      default: return t("errors.failed");
    }
  }

  async function translate(text: string) {
    if (running) return;
    say("user", text);
    setRunning(true);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const res = await fetch("/api/translate/text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({ text, targets, style, glossary, mode: "run" }),
      });
      const body = await res.json().catch(() => null);
      refreshCredits();
      if (!res.ok || !body?.ok) {
        say("tool", refusal(String(body?.code ?? ""), body));
        return;
      }
      const results: ResultTarget[] = body.results ?? [];
      say("tool", t("done", { count: results.length }), { from: body.from, results });
    } catch {
      say("tool", controller.signal.aborted ? tSteps("stopped") : t("errors.failed"));
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setRunning(false);
    }
  }

  async function editParagraph(instruction: string) {
    if (!editing || running) return;
    const { turnId, target, index } = editing;
    say("user", instruction);
    setRunning(true);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const paragraph = turns.find((t) => t.id === turnId)?.results?.find((r) => r.target === target)?.paragraphs[index];
      if (!paragraph) return;
      const res = await fetch("/api/translate/text/edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({ target, style, paragraph, instruction, glossary, mode: "run" }),
      });
      const body = await res.json().catch(() => null);
      refreshCredits();
      if (!res.ok || !body?.ok) {
        say("tool", refusal(String(body?.code ?? "")));
        return;
      }
      setTurns((prev) =>
        prev.map((t) =>
          t.id === turnId
            ? { ...t, results: t.results?.map((r) => (r.target === target ? { ...r, paragraphs: r.paragraphs.map((p, i) => (i === index ? body.text : p)) } : r)) }
            : t
        )
      );
      say("tool", t("editDone", { n: index + 1, language: languageLabel(target) }));
    } catch {
      say("tool", controller.signal.aborted ? tSteps("stopped") : t("errors.failed"));
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setRunning(false);
    }
  }

  function toggleTarget(code: string) {
    setTargets((prev) => {
      if (prev.includes(code)) return prev.filter((c) => c !== code);
      if (prev.length >= MAX_TRANSLATE_TARGETS) return prev;
      return [...prev, code];
    });
  }

  // The ORIGINAL paragraph beside its translation: the same split the
  // server used (lib/translate/text-source.ts splitParagraphs, pure),
  // run again here over the user's own turn text rather than threaded
  // back from the server — one fewer field to keep in step.
  const shellTurns: ShellTurn[] = turns.map((turn, index) => {
    const original = turn.role === "tool" && turn.results ? splitParagraphs(turns[index - 1]?.text ?? "") : [];
    return {
      id: turn.id,
      role: turn.role,
      text: turn.text,
      extra:
        turn.role === "tool" && turn.results && turn.results.length > 0 ? (
          <div className="mt-3 space-y-4" data-testid="translate-tool-results">
            {turn.from && (
              <p className="text-xs text-muted" data-testid="translate-tool-detected">
                {t("detectedFrom", { language: languageLabel(turn.from) })}
              </p>
            )}
            {turn.results.map((r) => (
              <div key={r.target} className="space-y-2" data-testid="translate-tool-target">
                <h3 className="text-xs font-semibold text-foreground">{languageLabel(r.target)}</h3>
                {r.sameLanguage ? (
                  <p className="text-xs text-muted">{t("sameLanguageNote")}</p>
                ) : (
                  <ol className="space-y-2">
                    {r.paragraphs.map((p, i) => {
                      const chosen = editing?.turnId === turn.id && editing.target === r.target && editing.index === i;
                      return (
                        <li key={i} className="grid gap-2 sm:grid-cols-2" data-testid="translate-tool-pair">
                          <p className="whitespace-pre-wrap rounded-item bg-panel p-2 text-xs text-muted" data-testid="translate-tool-original">{original[i] ?? ""}</p>
                          <button
                            type="button"
                            onClick={() => {
                              setEditing((v) => (chosen ? null : { turnId: turn.id, target: r.target, index: i }));
                              composerRef.current?.focus();
                            }}
                            aria-pressed={chosen}
                            data-testid="translate-tool-translated"
                            className={`block min-h-[44px] w-full whitespace-pre-wrap rounded-item p-2 text-start text-xs text-foreground ${chosen ? "bg-panel-hover ring-1 ring-foreground" : "bg-panel-hover hover:ring-1 hover:ring-border"}`}
                          >
                            {p}
                          </button>
                        </li>
                      );
                    })}
                  </ol>
                )}
                {r.kept > 0 && <p className="text-[11px] text-warning">{t("kept", { count: r.kept })}</p>}
              </div>
            ))}
          </div>
        ) : undefined,
    };
  });

  return (
    <ToolShell
      ref={composerRef}
      name={tNames("translate")}
      turns={shellTurns}
      working={
        running ? (
          <span className="inline-flex items-center gap-2 text-xs text-muted">
            <ThinkingIndicator size="sm" />
            {t("translating")}
          </span>
        ) : null
      }
      placeholder={editing ? t("editPlaceholder") : t("placeholder")}
      sending={running}
      onSend={(text) => void (editing ? editParagraph(text) : translate(text))}
      onStop={() => abortRef.current?.abort()}
      onLengthChange={setLength}
      options={[
        <span key="targets" className="relative">
          <button
            type="button"
            onClick={() => {
              setChoosingTargets((v) => !v);
              setChoosingStyle(false);
            }}
            aria-expanded={choosingTargets}
            data-testid="translate-tool-targets"
            className={OPTION}
          >
            {t("targetsLabel", { languages: targets.map(languageLabel).join(", ") })}
            <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
          {choosingTargets && (
            <div role="listbox" aria-multiselectable="true" aria-label={t("targetsLabel", { languages: "" })} className="surface absolute bottom-full start-0 z-10 mb-2 w-56 space-y-1">
              {LANGUAGES.map((l) => {
                const selected = targets.includes(l.code);
                const disabled = !selected && targets.length >= MAX_TRANSLATE_TARGETS;
                return (
                  <button
                    key={l.code}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    disabled={disabled}
                    onClick={() => toggleTarget(l.code)}
                    data-testid="translate-tool-target-option"
                    data-selected={selected}
                    className={`flex min-h-[44px] w-full items-center justify-between rounded-item px-2 text-start text-sm ${selected ? "bg-panel-hover text-foreground" : "text-muted hover:text-foreground"} disabled:opacity-40`}
                  >
                    {l.label}
                    {selected && <Check className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
                  </button>
                );
              })}
            </div>
          )}
        </span>,
        <span key="style" className="relative">
          <button
            type="button"
            onClick={() => {
              setChoosingStyle((v) => !v);
              setChoosingTargets(false);
            }}
            aria-expanded={choosingStyle}
            data-testid="translate-tool-style"
            className={OPTION}
          >
            {styleNames[style]}
            <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
          {choosingStyle && (
            <div role="listbox" aria-label={t("styleLabel")} className="surface absolute bottom-full start-0 z-10 mb-2 w-48 space-y-1">
              {TRANSLATE_STYLES.map((s) => (
                <button
                  key={s}
                  type="button"
                  role="option"
                  aria-selected={s === style}
                  onClick={() => {
                    setStyle(s);
                    setChoosingStyle(false);
                  }}
                  data-testid="translate-tool-style-option"
                  className={`block min-h-[44px] w-full rounded-item px-2 text-start text-sm ${s === style ? "bg-panel-hover text-foreground" : "text-muted hover:text-foreground"}`}
                >
                  {styleNames[s]}
                </button>
              ))}
            </div>
          )}
        </span>,
        <span key="glossary" className="relative">
          <button
            type="button"
            onClick={() => {
              setChoosingGlossary((v) => !v);
              setChoosingTargets(false);
              setChoosingStyle(false);
            }}
            aria-expanded={choosingGlossary}
            data-testid="translate-tool-glossary"
            className={OPTION}
          >
            {t("glossaryLabel", { count: glossary.length })}
            <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
          {choosingGlossary && (
            <div aria-label={t("glossaryLabel", { count: glossary.length })} className="surface absolute bottom-full start-0 z-10 mb-2 w-64 space-y-2">
              <p className="text-xs text-muted">{t("glossaryHint")}</p>
              {suggestedBrand && (
                <button
                  type="button"
                  onClick={() => addTerm(suggestedBrand)}
                  data-testid="translate-tool-glossary-suggested"
                  className="flex min-h-[36px] w-full items-center gap-1.5 rounded-item px-2 text-start text-xs text-muted hover:bg-panel-hover hover:text-foreground"
                >
                  <Plus className="h-3 w-3 shrink-0" aria-hidden="true" />
                  {t("glossarySuggested", { term: suggestedBrand })}
                </button>
              )}
              {glossary.length > 0 && (
                <ul className="space-y-1" data-testid="translate-tool-glossary-list">
                  {glossary.map((term) => (
                    <li key={term} className="flex min-h-[36px] items-center justify-between gap-2 rounded-item bg-panel px-2 text-xs text-foreground">
                      <span className="min-w-0 truncate">{term}</span>
                      <button type="button" onClick={() => removeTerm(term)} aria-label={t("glossaryRemove", { term })} data-testid="translate-tool-glossary-remove" className="shrink-0 text-muted hover:text-foreground">
                        <X className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  addTerm(newTerm);
                  setNewTerm("");
                }}
                className="flex gap-1.5"
              >
                <input
                  type="text"
                  value={newTerm}
                  onChange={(e) => setNewTerm(e.target.value)}
                  placeholder={t("glossaryPlaceholder")}
                  disabled={glossary.length >= MAX_GLOSSARY_TERMS}
                  data-testid="translate-tool-glossary-input"
                  className="input min-w-0 flex-1 text-xs"
                />
                <button type="submit" disabled={!newTerm.trim() || glossary.length >= MAX_GLOSSARY_TERMS} data-testid="translate-tool-glossary-add" className="btn-outline px-2 text-xs disabled:opacity-40">
                  <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </form>
            </div>
          )}
        </span>,
      ]}
      empty={{
        heading: t("empty.heading"),
        examples: [
          { key: "a", label: t("empty.examples.a") },
          { key: "b", label: t("empty.examples.b") },
          { key: "c", label: t("empty.examples.c") },
        ],
      }}
      footer={
        <>
          {editing && <ChosenBox label={t("editingLabel", { n: editing.index + 1, language: languageLabel(editing.target) })} onClear={() => setEditing(null)} />}
          {!running && length > 0 ? <CostEstimateHint credits={estimate.estimatedCredits} /> : null}
        </>
      }
    />
  );
}
