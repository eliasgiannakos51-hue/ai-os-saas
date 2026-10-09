"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Clock, Download, Files, Palette, Plus, Square, Undo2 } from "lucide-react";
import { ThinkingIndicator } from "@/components/ui/thinking-indicator";
import { useCredits } from "@/components/credits/credits-context";
import { useToast } from "@/components/toast/toast-context";
import { AiGeneratedNotice } from "@/components/ai/ai-generated-notice";
import { PublishControl } from "@/components/publishing/publish-control";
import { DesignControls } from "@/components/website-builder/design-controls";
import { useRememberedLine } from "@/components/website-builder/use-remembered-line";
import { ToolShell, ChosenBox, OPTION, ACTION, workIsBeside, type ShellTurn } from "@/components/shell/tool-shell";
import { isSiteRunning, requestSiteChange, requestSiteStop, requestSiteUndo, startSiteGeneration, watchSite } from "@/lib/website-builder/site-requests";
import { useGenerationNoteText } from "@/components/website-builder/use-generation-note-text";
import { parseGenerationNotes } from "@/lib/website-generation-notes";
import { normalisePages } from "@/lib/publishing/website-pages";
import { PAGE_COUNT_CHOICES, pageRequestBrief } from "@/lib/websites/page-request";
import { siteDownload } from "@/lib/websites/site-download";
import { saveBlob } from "@/components/ui/download-pdf-button";
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
import { useErrorText } from "@/lib/errors/use-error-text";
import type { UserWebsite } from "@/types/user-website";
import type { ChatComposerHandle } from "@/components/chat/chat-composer";

const MAX_NAME_LENGTH = 100;
const MAX_DESCRIPTION_LENGTH = 20000;

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
 *
 * PAGES (package 10), behind the switch "site-pages": a fourth option asks
 * for one, three or five pages (lib/websites/page-request.ts); a site with
 * pages shows them as tabs over the preview, and the parts, the chosen
 * part and the next change are the open page's — the route already edits
 * any page by its slug. Undo takes back the last change
 * (api/websites/[id]/undo), the download is the whole site
 * (lib/websites/site-download.ts), and what the code did to the site after
 * the model wrote it is said beside the preview, as on the page.
 *
 * FAILURES IN THE READER'S LANGUAGE. A refusal or a failure is said from
 * its status, its code and the site's own notes (lib/errors/use-error-text.ts,
 * failedText below) — never from the route's `error`, `message` or
 * `error_message`, which are English sentences for logs and, when the
 * provider fails, the provider's own JSON. Held by
 * scripts/tests/site-pages-edges.prodtest.mjs, scripts/tests/site-pages.test.mjs,
 * scripts/tests/tool-shell-edges.prodtest.mjs and scripts/tests/tool-shell.test.mjs.
 */
export function WebsiteShell({
  initialWebsites,
  initialBrief,
  initialOpenId = null,
  pages = false,
}: {
  initialWebsites: UserWebsite[];
  initialBrief?: string;
  /** A site to open on arrival — `?project=` from the Library or a star. */
  initialOpenId?: string | null;
  /** The switch "site-pages" (package 10), read by the page. */
  pages?: boolean;
}) {
  const t = useTranslations("dashboard.websiteBuilder");
  const tShell = useTranslations("dashboard.toolShell");
  const tNames = useTranslations("dashboard.tools.names");
  const tSteps = useTranslations("aiSteps");
  const tCommon = useTranslations("common");
  const tErrors = useTranslations("errors");
  const describe = useErrorText();
  const { refresh: refreshCredits, reportUsage, accountCreditPriceEur, planSlug } = useCredits();
  const { addToast } = useToast();

  const [websites, setWebsites] = useState<UserWebsite[]>(initialWebsites);
  const opened = initialOpenId && initialWebsites.some((w) => w.id === initialOpenId) ? initialOpenId : null;
  const [currentId, setCurrentId] = useState<string | null>(opened);
  const [pane, setPane] = useState<"site" | "recent" | null>(opened ? "site" : null);
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
  const [box, setBox] = useState<{ siteId: string; slug: string; index: number } | null>(null);
  // How many pages the next site is asked for; null lets the site decide.
  const [pageCount, setPageCount] = useState<number | null>(null);
  const [choosingPages, setChoosingPages] = useState(false);
  // The open page, with the site it belongs to, as the chosen part is.
  const [openPage, setOpenPage] = useState<{ siteId: string; slug: string } | null>(null);
  const describeNote = useGenerationNoteText();
  const composerRef = useRef<ChatComposerHandle>(null);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const say = (turn: Omit<Turn, "id">) => setTurns((prev) => [...prev, { ...turn, id: `${turn.role}${prev.length}` }]);

  // WHY A SITE WAS NOT MADE, from the row's status and notes. The worker
  // (api/websites/generate/process) fails a site before the model's work
  // (a limit, the credit hold) or when the provider fails, and then
  // releases the hold and charges nothing; a stop carries its own note
  // with what it cost; a row that failed AFTER a whole document was
  // written (a held site whose last status write failed) may have been
  // charged, so it is not promised otherwise.
  function failedText(record: UserWebsite): string {
    if (record.status === "flagged") return t("flaggedTitle");
    const stopped = parseGenerationNotes(record.generation_notes).find((note) => note.kind === "stopped");
    if (stopped) return describeNote(stopped);
    const written = looksLikeCompleteHtmlDocument(record.html_content ?? "");
    return `${t("generateFailed")} ${written ? tErrors("credits.unverified") : tErrors("credits.notCharged")}`;
  }
  const current = websites.find((w) => w.id === currentId) ?? null;
  const running = isSiteRunning;
  const remembered = useRememberedLine();

  function poll(id: string) {
    watchSite(id, {
      alive: () => mountedRef.current,
      onRecord: (record) => setWebsites((prev) => prev.map((w) => (w.id === id ? record : w))),
      onDone: (record, usage) => {
        void reportUsage(usage);
        if (record.status === "completed") {
          say({ role: "tool", text: tShell("site.done", { name: record.name }), siteId: id });
          // What the brief took from memory (package 6), said in the
          // conversation so a wrong name or colour is seen at once.
          const fromMemory = remembered.forRecord(record);
          if (fromMemory) say({ role: "tool", text: fromMemory });
          setPane("site");
        } else if (record.status === "flagged") {
          // Never the stored sentence: src/lib/websites/flagged-notice.ts.
          say({ role: "tool", text: `${t("flaggedTitle")}. ${t("flaggedBody")}` });
        } else {
          say({ role: "tool", text: failedText(record) });
        }
      },
    });
  }

  // Anything still building when the page loaded is watched again.
  useEffect(() => {
    for (const w of initialWebsites) if (running(w)) poll(w.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function generate(name: string, description: string, skipClarification: boolean) {
    setBusy(true);
    try {
      const outcome = await startSiteGeneration({ name, description, skipClarification });
      if (outcome.kind === "refused") {
        say({ role: "tool", text: describe(outcome.error).text });
        return;
      }
      if (outcome.kind === "questions") {
        setPending({ questions: outcome.questions, name, description });
        say({ role: "tool", text: tShell("site.questions"), questions: outcome.questions });
        void refreshCredits();
        return;
      }
      if (outcome.kind === "notMade") {
        say({ role: "tool", text: outcome.offTopic ? tShell("site.offTopic") : t("generateFailed") });
        return;
      }
      const record = outcome.record;
      setPending(null);
      setWebsites((prev) => (prev.some((w) => w.id === record.id) ? prev : [record, ...prev]));
      setCurrentId(record.id);
      setAsked((prev) => ({ ...prev, [record.id]: [description] }));
      say({ role: "tool", text: tShell("site.building", { name: record.name }) });
      poll(record.id);
    } catch (err) {
      say({ role: "tool", text: err instanceof TypeError ? tCommon("networkErrorCheckConnection") : t("generateFailed") });
    } finally {
      setBusy(false);
    }
  }

  async function change(request: string) {
    if (!current) return;
    const part = chosen;
    const partLabel = chosenLabel;
    const slug = pageSlug;
    setBusy(true);
    try {
      const outcome = await requestSiteChange({ websiteId: current.id, changeRequest: request, section: part, ...(pages ? { pageSlug: slug } : {}) });
      void refreshCredits();
      if (outcome.kind === "refused") {
        say({
          role: "tool",
          text:
            outcome.reason === "pageGone"
              ? t("editPageGone")
              : outcome.reason === "boxLost"
                ? tShell("box.lost")
                : outcome.reason === "held"
                  ? `${tShell("site.held")} ${tErrors("credits.notCharged")}`
                  : outcome.reason === "busy"
                    ? `${tShell("site.busy")} ${tErrors("credits.notCharged")}`
                    : describe(outcome.error).text,
        });
        return;
      }
      const record = outcome.record;
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

  async function undo() {
    if (!current) return;
    setBusy(true);
    try {
      const outcome = await requestSiteUndo(current.id);
      if (outcome.kind === "refused") {
        say({ role: "tool", text: outcome.reason === "nothing" ? tShell("pages.nothingToUndo") : outcome.reason === "busy" ? t("generating") : t("generateFailed") });
        return;
      }
      const record = outcome.record;
      setWebsites((prev) => prev.map((w) => (w.id === record.id ? record : w)));
      setBox(null);
      say({ role: "tool", text: tShell("pages.undone"), siteId: record.id });
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
    const description = applyDesignBrief(text.slice(0, MAX_DESCRIPTION_LENGTH), { ...design, imageCount: 0 }) + (pages ? pageRequestBrief(pageCount) : "");
    void generate(websiteNameFrom(text).slice(0, MAX_NAME_LENGTH), description, false);
  }

  function download(site: UserWebsite) {
    // With pages, the whole site: a .zip whose pages link to each other.
    const file = pages ? siteDownload(site) : { filename: `${site.name || "site"}.html`, type: "text/html;charset=utf-8", data: site.html_content };
    saveBlob(new Blob([file.data as BlobPart], { type: file.type }), file.filename);
  }

  // PRICE BEFORE, the same estimator the server reserves against (as on the page).
  const estimatedCost = estimateForAction(
    "websiteGenerate",
    { model: WEBSITE_BUILDER_MODEL, inputChars: length, imageCount: 0, planSlug },
    DEFAULTS,
    accountCreditPriceEur ?? undefined
  ).estimatedCredits;

  // THE OPEN PAGE (package 10): home unless a tab chose another of THIS site's.
  const sitePages = pages && current ? normalisePages(current.pages).pages : [];
  const pageSlug = openPage && current && openPage.siteId === current.id && sitePages.some((p) => p.slug === openPage.slug) ? openPage.slug : "";
  const html = pageSlug ? sitePages.find((p) => p.slug === pageSlug)!.html : current?.html_content ?? "";
  const notes = pages && current && current.status === "completed" ? parseGenerationNotes(current.generation_notes) : [];
  const complete = Boolean(current) && current!.status === "completed" && looksLikeCompleteHtmlDocument(html);
  const unfilled = complete ? findUnfilledPlaceholders(html) : [];
  // Only for a site whose every request is in this conversation: a number
  // typed in an earlier visit is not here to be recognised.
  const invented = complete && current && asked[current.id] ? findInventedNumbers(html, asked[current.id].join("\n")) : [];
  const boxes = useMemo(() => (complete ? findPageBoxes(html) : []), [complete, html]);
  const chosen = box && current && box.siteId === current.id && box.slug === pageSlug && box.index < boxes.length ? box.index : null;
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
              {pages && (
                <button
                  type="button"
                  onClick={() => void undo()}
                  disabled={current.status !== "completed" || busy}
                  aria-label={tShell("pages.undo")}
                  title={tShell("pages.undo")}
                  data-testid="site-undo"
                  className={`${ACTION} disabled:opacity-40`}
                >
                  <Undo2 className="h-4 w-4" aria-hidden="true" />
                </button>
              )}
              <button type="button" onClick={() => download(current)} disabled={current.status !== "completed" || !looksLikeCompleteHtmlDocument(current.html_content)} aria-label={t("downloadButton")} title={t("downloadButton")} data-testid="site-download" className={ACTION}>
                <Download className="h-4 w-4" aria-hidden="true" />
              </button>
            </>
          ),
          body: (
            <div data-testid="site-preview" className="flex h-full flex-col gap-3">
              <AiGeneratedNotice variant="block" />
              {notes.length > 0 && (
                <ul data-testid="site-notes" className="space-y-1 text-xs text-muted">
                  {notes.map((note, i) => (
                    <li key={`${note.kind}-${i}`}>{describeNote(note)}</li>
                  ))}
                </ul>
              )}
              {sitePages.length > 0 && current.status === "completed" && (
                <nav data-testid="site-pages" aria-label={t("pageSelectLabel")} className="flex flex-wrap gap-1.5">
                  {[{ slug: "", label: t("pageHome") }, ...sitePages].map((p) => (
                    <button
                      key={p.slug || "home"}
                      type="button"
                      aria-current={pageSlug === p.slug ? "page" : undefined}
                      data-testid="site-page"
                      onClick={() => setOpenPage({ siteId: current.id, slug: p.slug })}
                      className={`${OPTION} ${pageSlug === p.slug ? "border-foreground text-foreground" : ""}`}
                    >
                      {p.label}
                    </button>
                  ))}
                </nav>
              )}
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
                          setBox(chosen === i ? null : { siteId: current.id, slug: pageSlug, index: i });
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
                  key={`${current.id}:${pageSlug}:${html.length}`}
                  srcDoc={chosen === null ? html : outlineBoxes(html, chosen)}
                  sandbox=""
                  title={current.name}
                  className="min-h-[60vh] w-full flex-1 rounded-card bg-paper"
                />
              ) : (
                <p className="text-xs text-muted">{running(current) ? t("generating") : current.status === "flagged" ? t("flaggedBody") : failedText(current)}</p>
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
                      <p className="text-[11px] text-muted">{w.status === "completed" ? "✓" : running(w) ? t("generating") : w.status === "flagged" ? t("flaggedTitle") : t("statusFailed")}</p>
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
                  void requestSiteStop(current.id).then(
                    (ok) => addToast(ok ? tSteps("stopping") : t("generateFailed"), ok ? undefined : "error"),
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
        // HOW MANY PAGES (package 10): the fourth option, for a new site.
        ...(pages
          ? [
              <span key="pages" className="relative">
                <button
                  type="button"
                  onClick={() => setChoosingPages((v) => !v)}
                  aria-expanded={choosingPages}
                  disabled={current?.status === "completed" && !pending}
                  data-testid="site-page-count"
                  className={`${OPTION} disabled:opacity-40`}
                >
                  <Files className="h-3.5 w-3.5" aria-hidden="true" />
                  {pageCount === null ? tShell("pages.auto") : tShell("pages.count", { count: pageCount })}
                </button>
                {choosingPages && (
                  <div role="menu" className="surface absolute bottom-full start-0 z-10 mb-2 flex w-56 flex-col gap-1">
                    {[null, ...PAGE_COUNT_CHOICES].map((n) => (
                      <button
                        key={n ?? "auto"}
                        type="button"
                        role="menuitemradio"
                        aria-checked={pageCount === n}
                        data-testid="site-page-count-choice"
                        onClick={() => {
                          setPageCount(n);
                          setChoosingPages(false);
                        }}
                        className={`${OPTION} justify-start ${pageCount === n ? "border-foreground text-foreground" : ""}`}
                      >
                        {n === null ? tShell("pages.auto") : tShell("pages.count", { count: n })}
                      </button>
                    ))}
                  </div>
                )}
              </span>,
            ]
          : []),
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
