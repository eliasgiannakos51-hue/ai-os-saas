"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Clock, Download, Palette, Plus, Square } from "lucide-react";
import { ThinkingIndicator } from "@/components/ui/thinking-indicator";
import { useCredits } from "@/components/credits/credits-context";
import { useToast } from "@/components/toast/toast-context";
import { AiGeneratedNotice } from "@/components/ai/ai-generated-notice";
import { PublishControl } from "@/components/publishing/publish-control";
import { DesignControls } from "@/components/website-builder/design-controls";
import { ToolShell, ChosenBox, OPTION, ACTION, workIsBeside, type ShellTurn } from "@/components/shell/tool-shell";
import { fetchWithAuthRetry } from "@/lib/fetch-with-auth-retry";
import { getErrorMessage } from "@/lib/get-error-message";
import { websiteNameFrom } from "@/lib/website-name";
import { appendClarificationAnswers } from "@/lib/clarification-client";
import { applyDesignBrief, DEFAULT_DESIGN_CHOICES, type WebsiteDesignChoices } from "@/lib/website-design-brief";
import { estimateForAction } from "@/lib/billing/estimate";
import { WEBSITE_BUILDER_MODEL } from "@/lib/ai-models";
import { DEFAULTS } from "@/lib/billing/pricing-config";
import { findUnfilledPlaceholders } from "@/lib/website-placeholders";
import { findInventedNumbers } from "@/lib/website-invented-numbers";
import { looksLikeCompleteHtmlDocument } from "@/lib/html-document-check";
import { findPageBoxes, outlineBoxes, type PageBox } from "@/lib/website-boxes";
import type { UserWebsite } from "@/types/user-website";
import type { ChatComposerHandle } from "@/components/chat/chat-composer";

const MAX_NAME_LENGTH = 100;
const MAX_DESCRIPTION_LENGTH = 20000;
const POLL_INTERVAL_MS = 2500;

type Turn = { id: string; role: "user" | "tool"; text: string; siteId?: string; questions?: string[] };

/**
 * SITE IN THE SHELL (MASTER 14.3, package 3), behind the switch
 * "tool-shell". The same routes as components/website-builder/website-builder-workspace.tsx,
 * which stays the page for everybody the switch is off for.
 *
 * Said in the field, a description builds the site: /api/websites/generate
 * may first ask a few questions, which are answered in the field (or
 * skipped); then /api/websites/generate/process runs and the status is
 * polled, with Stop. The site opens beside the conversation, with Publish
 * and the HTML on top; while it is the current site, what is said next
 * changes it (/api/websites/edit). Three options: the design, the sites
 * made before, and a new site. Price before, as on the page: the same
 * estimator the server reserves against.
 *
 * BOXES (package 4): the page's parts — header, sections, footer — are
 * listed above the preview and pressed by number; the chosen one is
 * outlined in the preview, and the next change goes with its index. The
 * route puts back every other part exactly as stored
 * (lib/website-boxes.ts, takeEditedBox).
 */
export function WebsiteShell({ initialWebsites, initialBrief }: { initialWebsites: UserWebsite[]; initialBrief?: string }) {
  const t = useTranslations("dashboard.websiteBuilder");
  const tShell = useTranslations("dashboard.toolShell");
  const tNames = useTranslations("dashboard.tools.names");
  const tSteps = useTranslations("aiSteps");
  const tCommon = useTranslations("common");
  const { refresh: refreshCredits, reportUsage, accountCreditPriceEur, planSlug } = useCredits();
  const { addToast } = useToast();

  const [websites, setWebsites] = useState<UserWebsite[]>(initialWebsites);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [pane, setPane] = useState<"site" | "recent" | null>(null);
  const [design, setDesign] = useState<WebsiteDesignChoices>(DEFAULT_DESIGN_CHOICES);
  const [choosingDesign, setChoosingDesign] = useState(false);
  const [busy, setBusy] = useState(false);
  const [length, setLength] = useState(initialBrief?.length ?? 0);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [pending, setPending] = useState<{ questions: string[]; name: string; description: string } | null>(null);
  // What was asked of each site in THIS conversation, so the invented-number
  // check does not accuse a number the person typed themselves.
  const [asked, setAsked] = useState<Record<string, string[]>>({});
  // The chosen part, with the site it belongs to: an index means nothing
  // on another site, so opening one forgets it without a reset anywhere.
  const [box, setBox] = useState<{ siteId: string; index: number } | null>(null);
  const composerRef = useRef<ChatComposerHandle>(null);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const say = (turn: Omit<Turn, "id">) => setTurns((prev) => [...prev, { ...turn, id: `${turn.role}${prev.length}` }]);
  const current = websites.find((w) => w.id === currentId) ?? null;
  const running = (w: UserWebsite | null) => Boolean(w && (w.status === "pending" || w.status === "processing"));

  function poll(id: string) {
    async function tick() {
      let record: UserWebsite;
      let usage: unknown = null;
      try {
        const res = await fetch(`/api/websites/status?id=${id}`);
        const data = await res.json();
        if (!res.ok || !data.ok) {
          if (mountedRef.current) setTimeout(tick, POLL_INTERVAL_MS);
          return;
        }
        record = data.record as UserWebsite;
        usage = data;
      } catch {
        if (mountedRef.current) setTimeout(tick, POLL_INTERVAL_MS);
        return;
      }
      if (!mountedRef.current) return;
      setWebsites((prev) => prev.map((w) => (w.id === id ? record : w)));
      if (running(record)) {
        setTimeout(tick, POLL_INTERVAL_MS);
        return;
      }
      void reportUsage(usage);
      if (record.status === "completed") {
        say({ role: "tool", text: tShell("site.done", { name: record.name }), siteId: id });
        setPane("site");
      } else {
        say({ role: "tool", text: record.error_message ?? t("generateFailed") });
      }
    }
    void tick();
  }

  // Anything still building when the page loaded is watched again.
  useEffect(() => {
    for (const w of initialWebsites) if (running(w)) poll(w.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function generate(name: string, description: string, skipClarification: boolean) {
    setBusy(true);
    try {
      const res = await fetchWithAuthRetry("/api/websites/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description, referenceImagePaths: [], skipClarification }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        say({ role: "tool", text: getErrorMessage(data?.error, t("generateFailed")) });
        return;
      }
      if (data.needsClarification) {
        const questions = data.questions as string[];
        setPending({ questions, name, description });
        say({ role: "tool", text: tShell("site.questions"), questions });
        void refreshCredits();
        return;
      }
      if (!data.generated) {
        say({ role: "tool", text: data.message ?? t("generateFailed") });
        return;
      }
      const record = data.record as UserWebsite;
      setPending(null);
      setWebsites((prev) => (prev.some((w) => w.id === record.id) ? prev : [record, ...prev]));
      setCurrentId(record.id);
      setAsked((prev) => ({ ...prev, [record.id]: [description] }));
      say({ role: "tool", text: tShell("site.building", { name: record.name }) });
      if (!data.duplicateSuppressed) {
        void fetch("/api/websites/generate/process", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          keepalive: true,
          body: JSON.stringify({ websiteId: record.id, description, referenceImagePaths: [] }),
        });
      }
      poll(record.id);
    } catch (err) {
      say({ role: "tool", text: err instanceof TypeError ? tCommon("networkErrorCheckConnection") : getErrorMessage(err, t("generateFailed")) });
    } finally {
      setBusy(false);
    }
  }

  async function change(request: string) {
    if (!current) return;
    const part = chosen;
    const partLabel = chosenLabel;
    setBusy(true);
    try {
      const res = await fetchWithAuthRetry("/api/websites/edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ websiteId: current.id, changeRequest: request, referenceImagePaths: [], pageSlug: "", ...(part === null ? {} : { section: part }) }),
      });
      const data = await res.json();
      void refreshCredits();
      if (!res.ok || !data.ok || !data.edited) {
        say({
          role: "tool",
          text:
            data?.reason === "unknown_page" || data?.reason === "invalid_page"
              ? t("editPageGone")
              : data?.reason === "box_lost" || data?.reason === "bad_section"
                ? tShell("box.lost")
                : getErrorMessage(data?.error ?? data?.message, t("generateFailed")),
        });
        return;
      }
      const record = data.record as UserWebsite;
      setWebsites((prev) => prev.map((w) => (w.id === record.id ? record : w)));
      setAsked((prev) => ({ ...prev, [record.id]: [...(prev[record.id] ?? []), request] }));
      say({ role: "tool", text: part === null ? tShell("site.changed") : tShell("box.partChanged", { name: partLabel }), siteId: record.id });
      setPane("site");
    } catch {
      say({ role: "tool", text: tCommon("networkErrorCheckConnection") });
    } finally {
      setBusy(false);
    }
  }

  function send(text: string) {
    say({ role: "user", text });
    if (pending) {
      // THE ANSWERS, said in the field: one message answers the questions.
      const enriched = appendClarificationAnswers(pending.description, pending.questions, pending.questions.map((_, i) => (i === 0 ? text : "")));
      void generate(pending.name, enriched, true);
      return;
    }
    if (current && current.status === "completed") {
      void change(text);
      return;
    }
    const description = applyDesignBrief(text.slice(0, MAX_DESCRIPTION_LENGTH), { ...design, imageCount: 0 });
    void generate(websiteNameFrom(text).slice(0, MAX_NAME_LENGTH), description, false);
  }

  function download(site: UserWebsite) {
    const url = URL.createObjectURL(new Blob([site.html_content], { type: "text/html;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${site.name || "site"}.html`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // PRICE BEFORE, the same estimator the server reserves against (as on the page).
  const estimatedCost = estimateForAction(
    "websiteGenerate",
    { model: WEBSITE_BUILDER_MODEL, inputChars: length, imageCount: 0, planSlug },
    DEFAULTS,
    accountCreditPriceEur ?? undefined
  ).estimatedCredits;

  const html = current?.html_content ?? "";
  const complete = Boolean(current) && current!.status === "completed" && looksLikeCompleteHtmlDocument(html);
  const unfilled = complete ? findUnfilledPlaceholders(html) : [];
  // Only for a site whose every request is in this conversation: a number
  // typed in an earlier visit is not here to be recognised.
  const invented = complete && current && asked[current.id] ? findInventedNumbers(html, asked[current.id].join("\n")) : [];
  const boxes = useMemo(() => (complete ? findPageBoxes(html) : []), [complete, html]);
  const chosen = box && current && box.siteId === current.id && box.index < boxes.length ? box.index : null;
  // Literal keys, so the message slicer can bound them (lib/i18n/message-slices.ts).
  const boxLabel = (b: PageBox, i: number) =>
    b.heading ??
    (b.tag === "header"
      ? tShell("box.header")
      : b.tag === "footer"
        ? tShell("box.footer")
        : b.tag === "nav"
          ? tShell("box.nav")
          : tShell("box.part", { n: i + 1 }));
  const chosenLabel = chosen === null ? "" : boxLabel(boxes[chosen], chosen);

  const shellTurns: ShellTurn[] = turns.map((turn) => ({
    id: turn.id,
    role: turn.role,
    text: turn.text,
    extra: turn.questions ? (
      <div data-testid="site-questions" className="mt-2 space-y-2">
        <ol className="space-y-1">
          {turn.questions.map((q, i) => (
            <li key={`${q}-${i}`} className="text-sm text-foreground">
              {i + 1}. {q}
            </li>
          ))}
        </ol>
        {pending && pending.questions === turn.questions && (
          <button type="button" onClick={() => void generate(pending.name, pending.description, true)} data-testid="site-skip-questions" className={OPTION}>
            {tShell("site.skip")}
          </button>
        )}
      </div>
    ) : undefined,
    card:
      turn.siteId && websites.some((w) => w.id === turn.siteId)
        ? {
            title: websites.find((w) => w.id === turn.siteId)!.name,
            open: pane === "site" && currentId === turn.siteId,
            onOpen: () => {
              setCurrentId(turn.siteId!);
              setPane("site");
            },
          }
        : undefined,
  }));

  const work =
    pane === "site" && current
      ? {
          title: current.name,
          actions: (
            <>
              <PublishControl websiteId={current.id} websiteName={current.name} disabled={current.status !== "completed"} />
              <button type="button" onClick={() => download(current)} disabled={!complete} aria-label={t("downloadButton")} title={t("downloadButton")} className={ACTION}>
                <Download className="h-4 w-4" aria-hidden="true" />
              </button>
            </>
          ),
          body: (
            <div data-testid="site-preview" className="flex h-full flex-col gap-3">
              <AiGeneratedNotice variant="block" />
              {unfilled.length > 0 && <p className="text-xs text-warning">{t("unfilledTitle", { count: unfilled.length })} {t("unfilledBody")}</p>}
              {invented.length > 0 && <p className="text-xs text-warning">{t("inventedTitle", { count: invented.length })} {t("inventedBody")}</p>}
              {complete && boxes.length > 1 && (
                <div role="group" aria-label={tShell("box.boxes")} data-testid="site-boxes">
                  <p className="mb-1.5 text-xs text-muted">{tShell("box.hint")}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {boxes.map((b, i) => (
                      <button
                        key={`${i}:${b.start}`}
                        type="button"
                        aria-pressed={chosen === i}
                        data-testid="site-box"
                        onClick={() => {
                          setBox(chosen === i ? null : { siteId: current.id, index: i });
                          // On a phone the work covers the field: back to it.
                          if (!workIsBeside()) setPane(null);
                          composerRef.current?.focus();
                        }}
                        className={`${OPTION} ${chosen === i ? "border-foreground text-foreground" : ""}`}
                      >
                        {i + 1}. {boxLabel(b, i)}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {complete ? (
                <iframe
                  key={`${current.id}:${html.length}`}
                  srcDoc={chosen === null ? html : outlineBoxes(html, chosen)}
                  sandbox=""
                  title={current.name}
                  className="min-h-[60vh] w-full flex-1 rounded-card bg-paper"
                />
              ) : (
                <p className="text-xs text-muted">{running(current) ? t("generating") : current.error_message ?? t("generateFailed")}</p>
              )}
            </div>
          ),
        }
      : pane === "recent"
        ? {
            title: tNames("site"),
            body: (
              <ul className="row-list">
                {websites.map((w) => (
                  <li key={w.id} className="py-2">
                    <button
                      type="button"
                      onClick={() => {
                        setCurrentId(w.id);
                        setPane("site");
                      }}
                      className="w-full min-w-0 text-start"
                    >
                      <p className="break-words text-sm text-foreground">{w.name}</p>
                      <p className="text-[11px] text-muted">{w.status === "completed" ? "✓" : running(w) ? t("generating") : w.error_message ?? w.status}</p>
                    </button>
                  </li>
                ))}
              </ul>
            ),
          }
        : null;

  const buildingNow = running(current);

  return (
    <ToolShell
      ref={composerRef}
      name={tNames("site")}
      turns={shellTurns}
      working={
        busy || buildingNow ? (
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
            <ThinkingIndicator size="sm" />
            {t("generating")}
            {buildingNow && current && (
              <button
                type="button"
                data-testid="website-stop"
                onClick={() => {
                  void fetch(`/api/websites/${current.id}/cancel`, { method: "POST" }).then(
                    (res) => addToast(res.ok ? tSteps("stopping") : t("generateFailed"), res.ok ? undefined : "error"),
                    () => addToast(t("generateFailed"), "error")
                  );
                }}
                className={OPTION}
              >
                <Square className="h-2.5 w-2.5 fill-current" aria-hidden="true" />
                {tSteps("stop")}
              </button>
            )}
          </div>
        ) : null
      }
      placeholder={
        current?.status === "completed" && !pending
          ? chosen === null
            ? t("editPlaceholder")
            : tShell("box.placeholder", { name: chosenLabel })
          : t("descriptionPlaceholder")
      }
      sending={busy}
      onSend={send}
      initialText={initialBrief}
      onLengthChange={setLength}
      options={[
        <span key="design" className="relative">
          <button type="button" onClick={() => setChoosingDesign((v) => !v)} aria-expanded={choosingDesign} data-testid="site-design" className={OPTION}>
            <Palette className="h-3.5 w-3.5" aria-hidden="true" />
            {tShell("site.design")}
          </button>
          {choosingDesign && (
            <div className="surface absolute bottom-full start-0 z-10 mb-2 max-h-[60vh] w-80 overflow-y-auto">
              <DesignControls value={design} onChange={setDesign} imageCount={0} />
            </div>
          )}
        </span>,
        <button key="recent" type="button" onClick={() => setPane((v) => (v === "recent" ? null : "recent"))} aria-pressed={pane === "recent"} disabled={websites.length === 0} data-testid="site-recent" className={`${OPTION} disabled:opacity-40`}>
          <Clock className="h-3.5 w-3.5" aria-hidden="true" />
          {tShell("recent")}
        </button>,
        <button
          key="new"
          type="button"
          onClick={() => {
            setCurrentId(null);
            setPending(null);
            setPane(null);
          }}
          disabled={!current && !pending}
          data-testid="site-new"
          className={`${OPTION} disabled:opacity-40`}
        >
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          {tShell("site.new")}
        </button>,
      ]}
      footer={
        <>
          {chosen !== null && !pending && <ChosenBox label={chosenLabel} onClear={() => setBox(null)} />}
          {!busy && length > 0 && !(current?.status === "completed") ? <p className="mt-1.5 text-[11px] text-muted">{t("estimatedCost", { count: estimatedCost })}</p> : null}
        </>
      }
      work={work}
      onCloseWork={() => setPane(null)}
    />
  );
}
