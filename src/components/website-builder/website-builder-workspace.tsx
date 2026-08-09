"use client";

import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import {
  AlertTriangle,
  Download,
  Eye,
  History,
  Image as ImageIcon,
  Layout,
  Loader2,
  Plus,
  SearchX,
  Sparkles,
  Trash2,
  Wand2,
  X,
} from "lucide-react";
import { looksLikeCompleteHtmlDocument } from "@/lib/html-document-check";
import { useTranslations, useLocale } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { fetchWithAuthRetry } from "@/lib/fetch-with-auth-retry";
import { getErrorMessage } from "@/lib/get-error-message";
import { CreditShortfallPanel } from "@/components/billing/credit-shortfall-panel";
import type { CreditShortfall } from "@/lib/billing/shortfall";
import { useFormatRelativeTime } from "@/lib/use-relative-time";
import { FilePicker } from "@/components/ui/file-picker";
import { useCredits } from "@/components/credits/credits-context";
import { useToast } from "@/components/toast/toast-context";
import { EmptyState } from "@/components/empty-state";
import { useSortAndPaginate } from "@/lib/use-sort-and-paginate";
import { PaginationControls } from "@/components/pagination-controls";
import {
  ACCEPTED_REFERENCE_IMAGE_TYPES,
  buildReferenceImagePath,
  MAX_REFERENCE_IMAGE_BYTES,
  MAX_REFERENCE_IMAGES,
  REFERENCE_IMAGE_BUCKET,
} from "@/lib/website-reference-image";
import { estimateForAction } from "@/lib/billing/estimate";
import { WEBSITE_BUILDER_MODEL } from "@/lib/ai-models";
import { DEFAULTS } from "@/lib/billing/pricing-config";
import { isLargeGenerationRequest } from "@/lib/website-generation-limits";
import { appendClarificationAnswers } from "@/lib/clarification-client";
import { ClarificationQuestions } from "@/components/clarification/clarification-questions";
import { SecurityCheckedBadge } from "@/components/security/security-checked-badge";
import { FavoriteButton } from "@/components/favorites/favorite-button";
import { CardGrid, EntityCard, type EntityCardStatusTone } from "@/components/ui/entity-card";
import { DetailPanel, type DetailTab } from "@/components/ui/detail-panel";
import { PublishControl } from "@/components/publishing/publish-control";
import { ListLayout } from "@/components/ui/list-layout";
import { SortToggle } from "@/components/sort-toggle";
import { WEBSITE_BUILDER_ICON } from "@/lib/module-icons";
import type { UserWebsite, WebsiteVersion } from "@/types/user-website";
import { formatDateTime } from "@/lib/format-number";

const MAX_NAME_LENGTH = 100;
const MAX_DESCRIPTION_LENGTH = 20000;
const MAX_CHANGE_REQUEST_LENGTH = 20000;

// The edit form lives inside the detail panel's content area while its
// submit button lives in the panel's footer — the shared detail shape puts
// every committing action in the footer — so the two are tied together by
// this id via the button's `form` attribute.
const EDIT_FORM_ID = "website-edit-form";

type DetailTabKey = "preview" | "edit" | "history";

// Every status a user_websites row can hold, in the order the filter
// dropdown offers them, with the label key and card tone each maps to.
const WEBSITE_STATUSES = ["pending", "processing", "completed", "failed", "flagged"] as const;

const WEBSITE_STATUS_LABEL_KEYS: Record<string, string> = {
  pending: "statusGenerating",
  processing: "statusGenerating",
  completed: "statusCompleted",
  failed: "statusFailed",
  flagged: "statusFlagged",
};

const WEBSITE_STATUS_TONES: Record<string, EntityCardStatusTone> = {
  pending: "active",
  processing: "active",
  completed: "success",
  failed: "danger",
  flagged: "warning",
};

// How often the client polls /api/websites/status for a website still
// "pending"/"processing" — see pollWebsiteStatus below. Short enough to
// feel responsive, long enough not to hammer the DB during a generation
// that can legitimately take minutes.
const POLL_INTERVAL_MS = 2500;

// Rotating "still working on it" messages shown while a website is
// pending/processing — see the previewIsGenerating effect below.
const PROGRESS_MESSAGE_KEYS = ["progressStep1", "progressStep2", "progressStep3", "progressStep4"] as const;
const PROGRESS_MESSAGE_INTERVAL_MS = 17000;

// Below this many characters of partial html_content, the progressive
// live preview isn't worth rendering yet (barely any real markup exists,
// so an iframe would just show blank/near-blank — the spinner view reads
// better until there's something actually visible to show).
const LIVE_PREVIEW_MIN_CHARS = 200;

// Thumbnail preview for each list row — a real, live scaled-down render
// of the site's own html_content (not a fake icon), so visually distinct
// sites are actually recognizable at a glance without opening each one.
// Renders the iframe at a normal desktop viewport size, then scales the
// whole thing down with a CSS transform — the standard no-server-render
// way to get a thumbnail from HTML the browser can already render itself.
const THUMB_SOURCE_WIDTH = 1280;
const THUMB_SOURCE_HEIGHT = 800;
const THUMB_DISPLAY_WIDTH = 56;
const THUMB_DISPLAY_HEIGHT = 40;
const THUMB_SCALE = THUMB_DISPLAY_WIDTH / THUMB_SOURCE_WIDTH;

function WebsiteThumbnail({ website }: { website: UserWebsite }) {
  // A pending/processing row has no real html_content yet — rendering an
  // empty iframe would just look like a blank/broken thumbnail. A failed
  // row's stale (empty) content shouldn't render either. Show a status
  // icon instead in both cases; only a completed row gets the real,
  // live-rendered preview.
  if (website.status !== "completed") {
    return (
      <div
        className="flex shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-input"
        style={{ width: THUMB_DISPLAY_WIDTH, height: THUMB_DISPLAY_HEIGHT }}
        aria-hidden="true"
      >
        {website.status === "failed" ? (
          <AlertTriangle className="h-4 w-4 text-red-400" />
        ) : website.status === "flagged" ? (
          <AlertTriangle className="h-4 w-4 text-amber-400" />
        ) : (
          <Loader2 className="h-4 w-4 animate-spin text-muted" />
        )}
      </div>
    );
  }

  return (
    <div
      className="shrink-0 overflow-hidden rounded-md border border-border bg-white"
      style={{ width: THUMB_DISPLAY_WIDTH, height: THUMB_DISPLAY_HEIGHT }}
      aria-hidden="true"
    >
      <iframe
        srcDoc={website.html_content}
        sandbox=""
        tabIndex={-1}
        title=""
        style={{
          width: THUMB_SOURCE_WIDTH,
          height: THUMB_SOURCE_HEIGHT,
          transform: `scale(${THUMB_SCALE})`,
          transformOrigin: "top left",
          pointerEvents: "none",
        }}
      />
    </div>
  );
}

function downloadHtml(website: UserWebsite) {
  const blob = new Blob([website.html_content], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${website.name || "website"}.html`;
  a.click();
  URL.revokeObjectURL(url);
}

// Website Builder — real Claude generation (see api/websites/generate/route.ts
// + lib/website-builder.ts), saved to user_websites. All list/preview/
// generate/delete state lives here in one client component (same reasoning
// as chat-workspace.tsx: it's all one interaction, no benefit to splitting
// state across multiple components that'd just need to stay in sync).
export function WebsiteBuilderWorkspace({
  initialWebsites,
  favoritedWebsiteIds = [],
}: {
  initialWebsites: UserWebsite[];
  /** Starred project ids, resolved server-side in one batched query. */
  favoritedWebsiteIds?: string[];
}) {
  const formatRelativeTime = useFormatRelativeTime();
  const t = useTranslations("dashboard.websiteBuilder");
  const locale = useLocale();
  const tCommon = useTranslations("common");
  const tModule = useTranslations("module");
  const supabase = createClient();
  const { refresh: refreshCredits, reportUsage, accountCreditPriceEur } = useCredits();
  const { addToast } = useToast();

  const [websites, setWebsites] = useState<UserWebsite[]>(initialWebsites);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shortfall, setShortfall] = useState<CreditShortfall | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(initialWebsites[0]?.id ?? null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // The generation form is now behind the list's "+ New" button, like
  // every other list in the app — it opens by default only when there is
  // nothing to look at yet.
  const [showForm, setShowForm] = useState(initialWebsites.length === 0);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [detailTab, setDetailTab] = useState<DetailTabKey>("preview");

  // Optional reference images (logo/product photos/style screenshot, up
  // to MAX_REFERENCE_IMAGES) — uploaded to Supabase Storage right before
  // generation, then ALL sent together to Claude's vision input (see
  // api/websites/generate/route.ts). Never embedded into the generated
  // HTML itself — only informs color palette/style.
  const [referenceImageFiles, setReferenceImageFiles] = useState<File[]>([]);
  const [imageError, setImageError] = useState<string | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  // Clarifying-questions pre-check (see lib/clarification.ts,
  // api/websites/generate/route.ts) — set when the server's first-pass
  // check on a submission comes back needing more detail. Holds
  // everything the original submit already computed (name, description,
  // already-uploaded reference image paths) so answering/skipping
  // resubmits without re-uploading images or losing the original text.
  const [pendingClarification, setPendingClarification] = useState<{
    questions: string[];
    name: string;
    description: string;
    referenceImagePaths: string[];
  } | null>(null);

  // Post-generation editing — a second, separate AI call that takes the
  // website's existing html_content as context (see api/websites/edit)
  // instead of generating from scratch. Reference images here work the
  // same way as at initial generation (handleImageChange/removeReferenceImage
  // above) — a separate File[] state so attaching an image to an edit
  // request never touches the (unrelated) initial-generation form.
  const [editText, setEditText] = useState("");
  const [editing, setEditing] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [editImageFiles, setEditImageFiles] = useState<File[]>([]);
  const [editImageError, setEditImageError] = useState<string | null>(null);
  const editImageInputRef = useRef<HTMLInputElement>(null);

  // Version history — lazy-loaded per website (only fetched once "History"
  // is opened for a given site), keyed by website_id.
  const [versionsByWebsite, setVersionsByWebsite] = useState<Record<string, WebsiteVersion[]>>({});
  const [loadingVersionsFor, setLoadingVersionsFor] = useState<string | null>(null);
  const [viewingVersion, setViewingVersion] = useState<WebsiteVersion | null>(null);

  // Guards every poll's setState against firing after this component has
  // unmounted (e.g. the user navigated to a different dashboard page
  // while a generation was still in flight).
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Polls /api/websites/status every POLL_INTERVAL_MS for one website
  // until it leaves "pending"/"processing" — a recursive setTimeout
  // rather than setInterval, so a slow poll response never overlaps with
  // the next one. Used both right after starting a new generation and
  // (via the effect below) to resume watching any website that was still
  // processing when this page loaded — e.g. the user started a
  // generation, closed the tab, and came back later: the server-side
  // work (see api/websites/generate/process/route.ts) already finished
  // or is still running entirely independently of whether anyone was
  // watching, so this just catches the UI up to whatever the database
  // already says.
  function pollWebsiteStatus(id: string) {
    async function tick() {
      let record: UserWebsite;
      let usagePayload: unknown = null;
      try {
        const res = await fetch(`/api/websites/status?id=${id}`);
        const data = await res.json();
        if (!res.ok || !data.ok) {
          if (mountedRef.current) setTimeout(tick, POLL_INTERVAL_MS);
          return;
        }
        record = data.record as UserWebsite;
        // Kept outside the try so the terminal-status branch below can
        // report what the generation cost.
        usagePayload = data;
      } catch {
        // A transient network hiccup while polling isn't the same as the
        // generation failing — just retry on the next tick.
        if (mountedRef.current) setTimeout(tick, POLL_INTERVAL_MS);
        return;
      }

      if (!mountedRef.current) return;
      setWebsites((prev) => prev.map((w) => (w.id === id ? record : w)));

      if (record.status === "pending" || record.status === "processing") {
        setTimeout(tick, POLL_INTERVAL_MS);
        return;
      }

      void reportUsage(usagePayload);
      if (record.status === "completed") {
        addToast(t("generated"));
      } else if (record.status === "failed") {
        addToast(`✗ ${record.error_message ?? t("generateFailed")}`, "error");
      } else if (record.status === "flagged") {
        addToast(`⚠ ${record.error_message ?? "This website was flagged by our safety review."}`, "error");
      }
    }
    void tick();
  }

  // AI Output Protection Layer — one complimentary, no-extra-charge
  // regenerate for a website flagged by the safety review (see
  // api/websites/[id]/regenerate/route.ts). The route itself only resets
  // the row and hands back the original description/image paths; this
  // fires the exact same two-request flow (process + poll) a fresh
  // generation uses.
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null);
  async function handleRegenerateFlagged(id: string) {
    setRegeneratingId(id);
    try {
      const res = await fetchWithAuthRetry(`/api/websites/${id}/regenerate`, { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        addToast(`✗ ${getErrorMessage(data?.error, "Could not regenerate this website.")}`, "error");
        return;
      }
      void fetch("/api/websites/generate/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        keepalive: true,
        body: JSON.stringify({
          websiteId: data.websiteId,
          description: data.description,
          referenceImagePaths: data.referenceImagePaths ?? [],
        }),
      });
      pollWebsiteStatus(id);
    } catch {
      addToast(tCommon("networkError"), "error");
    } finally {
      setRegeneratingId(null);
    }
  }

  // On mount, resume polling for anything that was still in flight when
  // this page was loaded (fresh load, or the user came back after
  // closing the tab mid-generation) — no click required, per the above.
  const resumedPollsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    for (const website of initialWebsites) {
      if (
        (website.status === "pending" || website.status === "processing") &&
        !resumedPollsRef.current.has(website.id)
      ) {
        resumedPollsRef.current.add(website.id);
        pollWebsiteStatus(website.id);
      }
    }
    // Only ever run this reconciliation against the server-rendered
    // initial list — polling loops track their own completion and don't
    // need to be re-triggered when `websites` itself changes client-side.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialWebsites]);

  // Deep link support for ?project=<id>, which is the href every starred
  // Website Builder project has always pointed at (lib/favoritable.ts's
  // EXTRA_FAVORITABLE) — the workspace never read it, so following a
  // favorite landed on whichever project happened to be newest instead of
  // the one that was starred.
  //
  // Read from window.location rather than useSearchParams: this component
  // is a client component inside a page that next build would otherwise
  // demand a Suspense boundary for, and the value is only needed once, on
  // mount.
  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("project");
    if (requested && initialWebsites.some((w) => w.id === requested)) {
      setPreviewId(requested);
      setShowForm(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleImageChange(e: ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files ?? []);
    e.target.value = ""; // allow re-selecting the same file(s) after removing them
    if (selected.length === 0) return;

    setReferenceImageFiles((prev) => {
      const remainingSlots = MAX_REFERENCE_IMAGES - prev.length;
      if (remainingSlots <= 0) {
        setImageError(t("imageTooMany", { max: MAX_REFERENCE_IMAGES }));
        return prev;
      }

      const accepted: File[] = [];
      let rejected: "type" | "size" | null = null;
      for (const file of selected) {
        if (accepted.length >= remainingSlots) break;
        if (!ACCEPTED_REFERENCE_IMAGE_TYPES.includes(file.type as (typeof ACCEPTED_REFERENCE_IMAGE_TYPES)[number])) {
          rejected = "type";
          continue;
        }
        if (file.size > MAX_REFERENCE_IMAGE_BYTES) {
          rejected = rejected ?? "size";
          continue;
        }
        accepted.push(file);
      }

      if (rejected === "type") setImageError(t("imageInvalidType"));
      else if (rejected === "size") setImageError(t("imageTooLarge"));
      else if (selected.length > remainingSlots) setImageError(t("imageTooMany", { max: MAX_REFERENCE_IMAGES }));
      else setImageError(null);

      return accepted.length > 0 ? [...prev, ...accepted] : prev;
    });
  }

  function removeReferenceImage(index: number) {
    setReferenceImageFiles((prev) => prev.filter((_, i) => i !== index));
    setImageError(null);
  }

  // Mirrors handleImageChange/removeReferenceImage above exactly, just
  // targeting the edit form's own separate image state — see the
  // editImageFiles comment above for why these are kept separate rather
  // than shared.
  function handleEditImageChange(e: ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (selected.length === 0) return;

    setEditImageFiles((prev) => {
      const remainingSlots = MAX_REFERENCE_IMAGES - prev.length;
      if (remainingSlots <= 0) {
        setEditImageError(t("imageTooMany", { max: MAX_REFERENCE_IMAGES }));
        return prev;
      }

      const accepted: File[] = [];
      let rejected: "type" | "size" | null = null;
      for (const file of selected) {
        if (accepted.length >= remainingSlots) break;
        if (!ACCEPTED_REFERENCE_IMAGE_TYPES.includes(file.type as (typeof ACCEPTED_REFERENCE_IMAGE_TYPES)[number])) {
          rejected = "type";
          continue;
        }
        if (file.size > MAX_REFERENCE_IMAGE_BYTES) {
          rejected = rejected ?? "size";
          continue;
        }
        accepted.push(file);
      }

      if (rejected === "type") setEditImageError(t("imageInvalidType"));
      else if (rejected === "size") setEditImageError(t("imageTooLarge"));
      else if (selected.length > remainingSlots) setEditImageError(t("imageTooMany", { max: MAX_REFERENCE_IMAGES }));
      else setEditImageError(null);

      return accepted.length > 0 ? [...prev, ...accepted] : prev;
    });
  }

  function removeEditReferenceImage(index: number) {
    setEditImageFiles((prev) => prev.filter((_, i) => i !== index));
    setEditImageError(null);
  }

  // Shared by the initial submit and by answering/skipping a
  // clarification prompt — the ONLY difference between those call sites
  // is skipClarification and whether description already has the user's
  // answers folded in (see lib/clarification.ts's
  // appendClarificationAnswers, used by handleClarificationAnswer
  // below). Reference images are uploaded once, by the caller, and their
  // already-uploaded paths are passed in here — never re-uploaded on a
  // clarification resubmission.
  // Every exit from the new-project form goes through here.
  //
  // DEFECT this fixes: the staged files were cleared ONLY on a successful
  // generation. A generation that failed, a form the user closed, or an
  // abandoned clarification all left the previous project's images sitting
  // in state — and the next "+ New" re-uploaded and attached them. That is
  // the client half of "photos from a previous project appeared in the new
  // one" (the server half is api/websites/generate/process, which used to
  // take its image list from the request body).
  function resetGenerationForm() {
    setName("");
    setDescription("");
    setReferenceImageFiles([]);
    setPendingClarification(null);
    setError(null);
    setShortfall(null);
  }

  async function submitGeneration(
    trimmedName: string,
    finalDescription: string,
    referenceImagePaths: string[],
    skipClarification: boolean
  ) {
    setGenerating(true);
    setError(null);
    setShortfall(null);
    try {
      // Step 1/2: create the "pending" row and get its id back — this
      // request is deliberately fast (no AI call in it beyond the small
      // clarification/off-topic classifiers), so it can never itself be
      // mistaken for a hung/timed-out request no matter how long the
      // actual generation ends up taking.
      // fetchWithAuthRetry (not plain fetch): this is the resubmission
      // after a clarifying-questions pause on skipClarification===true —
      // exactly the scenario where a user's access token can expire while
      // they compose real answers. See lib/fetch-with-auth-retry.ts.
      const res = await fetchWithAuthRetry("/api/websites/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: trimmedName,
          description: finalDescription,
          referenceImagePaths,
          skipClarification,
        }),
      });
      const data = await res.json();

      if (!res.ok || !data.ok) {
        setError(getErrorMessage(data?.error, "Something went wrong — no credits were charged. Please try again."));
        return;
      }
      if (data.needsClarification) {
        setPendingClarification({
          questions: data.questions as string[],
          name: trimmedName,
          description: finalDescription,
          referenceImagePaths,
        });
        void refreshCredits();
        return;
      }
      if (!data.generated) {
        // A credit shortfall arrives with everything needed to act on it
        // (api/websites/generate). Anything else is still a plain error.
        if (data.shortfall) {
          setShortfall(data.shortfall as CreditShortfall);
          setError(null);
        } else {
          setError(data.message ?? "Could not generate the website.");
        }
        return;
      }

      const record = data.record as UserWebsite;
      setPreviewId(record.id);
      resetGenerationForm();
      setShowForm(false);
      setDetailTab("preview");

      // Idempotency guard (see api/websites/generate/route.ts) — a fast
      // double-submit resolves to the SAME already-created pending row
      // instead of a new one. That row is already in `websites`/already
      // has its own process call in flight (or about to), so this branch
      // must NOT add a duplicate list entry or fire a second real,
      // billed generation request for it — just resume watching it and
      // tell the user plainly what happened.
      if (data.duplicateSuppressed) {
        setWebsites((prev) => (prev.some((w) => w.id === record.id) ? prev : [record, ...prev]));
        addToast(t("duplicateGenerationSuppressed"));
        pollWebsiteStatus(record.id);
        return;
      }

      setWebsites((prev) => [record, ...prev]);

      // Step 2/2: kick off the actual generation as a second, independent
      // request. Deliberately NOT awaited: `keepalive: true` tells the
      // browser to still deliver this request even if the user navigates
      // away or closes this tab moments after clicking Generate, so the
      // server-side work — and the credit charge, which only ever
      // happens there, only after confirmed success — survives regardless
      // of whether this tab stays open to see the result. Progress from
      // here on is entirely tracked via polling (pollWebsiteStatus), not
      // this request's response.
      void fetch("/api/websites/generate/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        keepalive: true,
        body: JSON.stringify({ websiteId: record.id, description: finalDescription, referenceImagePaths }),
      });

      pollWebsiteStatus(record.id);
    } catch (err) {
      // A fetch() throwing at all (as opposed to resolving with a non-ok
      // response) means the request never reached the server — a real
      // network-level failure (offline, DNS, connection refused), not a
      // slow response. That distinction is meaningful now: step 1 above
      // is always fast, so nothing here can be a disguised "the AI call
      // is just taking a while" timeout the way the single-request flow
      // used to produce.
      setError(
        err instanceof TypeError
          ? "Network error — please check your connection and try again."
          : getErrorMessage(err, "Something went wrong — no credits were charged. Please try again.")
      );
    } finally {
      setGenerating(false);
    }
  }

  async function handleGenerate(e: FormEvent) {
    e.preventDefault();
    const trimmedName = name.trim();
    const trimmedDescription = description.trim();
    // pendingClarification blocks a second submission specifically
    // because the Website Name <input type="text"> isn't disabled while
    // the clarification prompt is showing — pressing Enter in it (a
    // plain text input, unlike the textarea, submits its form by
    // default) would otherwise silently start a second, independent
    // generation attempt and abandon the pending one's questions.
    if (!trimmedName || !trimmedDescription || generating || pendingClarification) return;

    setGenerating(true);
    setError(null);
    try {
      let referenceImagePaths: string[] = [];
      if (referenceImageFiles.length > 0) {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          setError(tCommon("notAuthenticated"));
          return;
        }

        // Upload every selected image before calling generate — if ANY
        // upload fails, abort rather than generate with a partial/wrong
        // set of images silently.
        const uploadResults = await Promise.all(
          referenceImageFiles.map(async (file) => {
            const path = buildReferenceImagePath(user.id, file.name);
            const { error: uploadError } = await supabase.storage
              .from(REFERENCE_IMAGE_BUCKET)
              .upload(path, file, { contentType: file.type });
            return { path, uploadError };
          })
        );
        const firstFailure = uploadResults.find((r) => r.uploadError);
        if (firstFailure) {
          setError(getErrorMessage(firstFailure.uploadError, "Could not upload the reference images."));
          setGenerating(false);
          return;
        }
        referenceImagePaths = uploadResults.map((r) => r.path);
      }

      await submitGeneration(trimmedName, trimmedDescription, referenceImagePaths, false);
    } catch (err) {
      setError(
        err instanceof TypeError
          ? "Network error — please check your connection and try again."
          : getErrorMessage(err, "Something went wrong — no credits were charged. Please try again.")
      );
      setGenerating(false);
    }
  }

  function handleClarificationAnswer(answers: string[]) {
    if (!pendingClarification) return;
    const enrichedDescription = appendClarificationAnswers(
      pendingClarification.description,
      pendingClarification.questions,
      answers
    );
    void submitGeneration(
      pendingClarification.name,
      enrichedDescription,
      pendingClarification.referenceImagePaths,
      true
    );
  }

  function handleClarificationSkip() {
    if (!pendingClarification) return;
    void submitGeneration(
      pendingClarification.name,
      pendingClarification.description,
      pendingClarification.referenceImagePaths,
      true
    );
  }

  async function handleDelete(id: string) {
    if (deletingId) return;
    setDeletingId(id);
    const { error: deleteError } = await supabase.from("user_websites").delete().eq("id", id);
    setDeletingId(null);

    if (deleteError) {
      addToast(`✗ ${deleteError.message}`, "error");
      return;
    }

    setWebsites((prev) => prev.filter((w) => w.id !== id));
    setPreviewId((current) => (current === id ? null : current));
    setVersionsByWebsite((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    addToast(t("deleted"));
  }

  function selectWebsite(id: string, tab: DetailTabKey = "preview") {
    setPreviewId(id);
    setDetailTab(tab);
    if (tab === "history") void loadVersions(id);
    setViewingVersion(null);
    setEditText("");
    setEditError(null);
    setEditImageFiles([]);
    setEditImageError(null);
  }

  async function handleEdit(e: FormEvent) {
    e.preventDefault();
    const websiteId = previewId;
    const trimmedChangeRequest = editText.trim();
    if (!websiteId || !trimmedChangeRequest || editing) return;

    setEditing(true);
    setEditError(null);
    try {
      let referenceImagePaths: string[] = [];
      if (editImageFiles.length > 0) {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          setEditError("Not authenticated.");
          return;
        }
        const uploadResults = await Promise.all(
          editImageFiles.map(async (file) => {
            const path = buildReferenceImagePath(user.id, file.name);
            const { error: uploadError } = await supabase.storage
              .from(REFERENCE_IMAGE_BUCKET)
              .upload(path, file, { contentType: file.type });
            return { path, uploadError };
          })
        );
        const firstFailure = uploadResults.find((r) => r.uploadError);
        if (firstFailure) {
          setEditError(getErrorMessage(firstFailure.uploadError, "Could not upload the reference images."));
          return;
        }
        referenceImagePaths = uploadResults.map((r) => r.path);
      }

      const res = await fetchWithAuthRetry("/api/websites/edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ websiteId, changeRequest: trimmedChangeRequest, referenceImagePaths }),
      });
      const data = await res.json();
      void refreshCredits();

      if (!res.ok || !data.ok) {
        setEditError(getErrorMessage(data?.error, "Could not apply that change."));
        return;
      }
      if (!data.edited) {
        setEditError(data.message ?? "Could not apply that change.");
        return;
      }

      const record = data.record as UserWebsite;
      setWebsites((prev) => prev.map((w) => (w.id === record.id ? record : w)));
      setEditText("");
      setEditImageFiles([]);
      setViewingVersion(null);
      // The new version is now newer than whatever's cached — drop it so
      // the next "History" open re-fetches instead of showing stale data.
      setVersionsByWebsite((prev) => {
        const next = { ...prev };
        delete next[record.id];
        return next;
      });
      addToast(t("editApplied"));
    } catch {
      setEditError("Network error — please try again.");
    } finally {
      setEditing(false);
    }
  }

  // Version history is still fetched lazily — now on the first time the
  // History TAB is opened for a given site rather than on a button press.
  async function loadVersions(websiteId: string) {
    if (versionsByWebsite[websiteId] || loadingVersionsFor === websiteId) return;

    setLoadingVersionsFor(websiteId);
    const { data, error: versionsError } = await supabase
      .from("website_versions")
      .select("*")
      .eq("website_id", websiteId)
      .order("version_number", { ascending: false });
    setLoadingVersionsFor(null);

    if (versionsError) {
      addToast(`✗ ${versionsError.message}`, "error");
      return;
    }
    setVersionsByWebsite((prev) => ({ ...prev, [websiteId]: (data as WebsiteVersion[]) ?? [] }));
  }

  function selectDetailTab(key: DetailTabKey) {
    setDetailTab(key);
    if (key === "history" && previewId) void loadVersions(previewId);
  }

  const previewWebsite = websites.find((w) => w.id === previewId) ?? null;
  const activeVersions = previewWebsite ? versionsByWebsite[previewWebsite.id] : undefined;
  const displayedHtml = viewingVersion?.html_content ?? previewWebsite?.html_content ?? "";
  // Guards the iframe against rendering a blank/broken page for content
  // that's somehow incomplete (e.g. a row saved before the server-side
  // truncation check below existed) — shows a clear message instead.
  const displayedHtmlIsComplete = looksLikeCompleteHtmlDocument(displayedHtml);

  // Rotating progress messages for the pending/processing preview panel —
  // cycles through PROGRESS_MESSAGE_KEYS every PROGRESS_MESSAGE_INTERVAL_MS
  // so a long generation reads as active progress instead of a single
  // frozen "loading" state. Not tied to any real server-side phase (the
  // backend doesn't expose discrete phases) — a perceived-progress
  // affordance only, same spirit as other AI tools' rotating "thinking"
  // messages.
  const previewIsGenerating = previewWebsite?.status === "pending" || previewWebsite?.status === "processing";
  const [progressMessageIndex, setProgressMessageIndex] = useState(0);
  useEffect(() => {
    if (!previewIsGenerating) {
      setProgressMessageIndex(0);
      return;
    }
    const interval = setInterval(() => {
      setProgressMessageIndex((i) => (i + 1) % PROGRESS_MESSAGE_KEYS.length);
    }, PROGRESS_MESSAGE_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [previewIsGenerating]);

  // Progressive live preview: while still pending/processing, the server
  // (api/websites/generate/process/route.ts) periodically saves the
  // in-flight generation's partial HTML to html_content, which the
  // client already picks up via normal polling — so once there's enough
  // of it to look like real markup, render it live instead of only a
  // spinner, same "watch it being written" effect a streaming chat UI
  // gives, without needing this component to hold its own connection to
  // the generation (which would defeat the whole point of the background
  // job architecture — see pollWebsiteStatus above).
  const livePreviewHtml = previewWebsite?.status === "processing" ? previewWebsite.html_content : "";
  const hasLivePreviewContent = livePreviewHtml.trim().length > LIVE_PREVIEW_MIN_CHARS;

  // Live estimated credit cost — recomputed on every render from the
  // current form state, so it updates as the user types/attaches images,
  // before they ever click Generate.
  //
  // Deliberately the SAME estimator the server reserves against
  // (lib/billing/estimate.ts, ACTION_PROFILES.websiteGenerate), so the
  // number shown here and the number actually held are the same
  // calculation on the same inputs rather than two formulas that can
  // drift apart. It is still an ESTIMATE: settlement charges the real
  // measured cost of every sub-call and releases the rest of the hold.
  //
  // DEFAULTS, not resolvePricingConfig(): this runs in the browser, where
  // the server-only pricing env vars are not readable. An operator who
  // overrides CREDIT_MARGIN_MULTIPLIER / CREDIT_PRICE_EUR moves the real
  // charge but not this preview, so those overrides would need a
  // NEXT_PUBLIC_ mirror to show up here.
  // accountCreditPriceEur (served by /api/credits/balance) rather than the
  // list price: the same generation charges 26 credits on Free and 64 on
  // Ultimate, so estimating at list price showed Ultimate users less than
  // half of what they would actually be billed.
  const estimatedCost = estimateForAction(
    "websiteGenerate",
    {
      model: WEBSITE_BUILDER_MODEL,
      inputChars: description.trim().length,
      imageCount: referenceImageFiles.length,
    },
    DEFAULTS,
    accountCreditPriceEur ?? undefined
  ).estimatedCredits;


  // Search + status filter + sort + pagination — the same toolbar every
  // other list in the app now carries (components/ui/list-layout.tsx),
  // over the same shared sort/paginate hook.
  const filteredWebsites = websites.filter((website) => {
    const q = query.trim().toLowerCase();
    if (q && !`${website.name} ${website.description ?? ""}`.toLowerCase().includes(q)) return false;
    if (statusFilter && website.status !== statusFilter) return false;
    return true;
  });

  const { sortOrder, setSortOrder, page, setPage, totalPages, paginated: paginatedWebsites } =
    useSortAndPaginate(filteredWebsites, `${query}|${statusFilter}`);

  const detailTabs: DetailTab[] = [
    { key: "preview", label: t("tabPreview"), icon: Eye },
    { key: "edit", label: t("tabEdit"), icon: Wand2 },
    {
      key: "history",
      label: t("tabHistory"),
      icon: History,
      badge: activeVersions?.length || undefined,
    },
  ];

  return (
    <div className="space-y-6">
      {previewWebsite && (
        <DetailPanel
          icon={WEBSITE_BUILDER_ICON}
          accentSlug="websiteBuilder"
          title={previewWebsite.name}
          subtitle={
            <span
              title={formatDateTime(previewWebsite.created_at, locale)}
              suppressHydrationWarning
            >
              {formatRelativeTime(previewWebsite.created_at)}
            </span>
          }
          corner={
            <>
              {(previewWebsite.status === "completed" || previewWebsite.status === "flagged") && (
                <SecurityCheckedBadge resourceType="website" resourceId={previewWebsite.id} />
              )}
              <FavoriteButton
                table="user_websites"
                recordId={previewWebsite.id}
                headline={previewWebsite.name}
                initialFavorited={favoritedWebsiteIds.includes(previewWebsite.id)}
                variant="inline"
              />
              <button
                type="button"
                onClick={() => setPreviewId(null)}
                aria-label={tCommon("cancel")}
                title={tCommon("cancel")}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors duration-150 hover:bg-panel-hover hover:text-foreground"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </>
          }
          tabs={detailTabs}
          activeTab={detailTab}
          onTabChange={(key) => selectDetailTab(key as DetailTabKey)}
          actions={
            detailTab === "edit" ? (
              <button
                type="submit"
                form={EDIT_FORM_ID}
                disabled={editing || !editText.trim() || previewWebsite.status !== "completed"}
                className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-orange-500 px-4 py-2 text-xs font-semibold text-black transition-all duration-200 hover:opacity-90 hover:shadow-[0_0_16px_rgba(249,115,22,0.35)] disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-0"
              >
                {editing ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <Wand2 className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                {editing ? t("editApplying") : t("editButton")}
              </button>
            ) : (
              <>
                {/* V3 Task 2 — hosting. Self-contained: it fetches its own
                    published state, so nothing about this workspace's
                    existing data flow changes. */}
                <PublishControl
                  websiteId={previewWebsite.id}
                  websiteName={previewWebsite.name}
                  disabled={previewWebsite.status !== "completed"}
                />
                <button
                  type="button"
                  onClick={() => downloadHtml(previewWebsite)}
                  disabled={previewWebsite.status !== "completed"}
                  className="inline-flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground transition-colors duration-150 hover:border-orange-500 hover:text-orange-400 disabled:cursor-not-allowed disabled:opacity-40 sm:min-h-0"
                >
                  <Download className="h-3.5 w-3.5" aria-hidden="true" />
                  {t("downloadButton")}
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(previewWebsite.id)}
                  disabled={deletingId === previewWebsite.id}
                  className="inline-flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-medium text-red-400 transition-colors duration-150 hover:border-red-500/60 hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-40 sm:min-h-0"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  {t("deleteButton")}
                </button>
              </>
            )
          }
        >
          {detailTab === "preview" && (
            <>
              {viewingVersion && (
                <p className="mb-3 rounded-lg border border-orange-800 bg-orange-950/20 px-3 py-2 text-xs text-orange-300">
                  {t("viewingOldVersion", { number: viewingVersion.version_number })}{" "}
                  <button
                    type="button"
                    onClick={() => setViewingVersion(null)}
                    className="font-semibold underline hover:no-underline"
                  >
                    {t("backToLatest")}
                  </button>
                </p>
              )}

              {!viewingVersion && previewIsGenerating && hasLivePreviewContent ? (
                <div className="relative h-[500px] w-full">
                  <iframe
                    key={previewWebsite.id}
                    srcDoc={livePreviewHtml}
                    sandbox=""
                    title={previewWebsite.name}
                    className="h-full w-full rounded-xl border border-border bg-white"
                  />
                  <div className="absolute left-1/2 top-3 flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-orange-500/40 bg-black/80 px-3 py-1.5 text-xs font-medium text-orange-300 shadow-lg backdrop-blur">
                    <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                    {t("livePreviewBadge")}
                  </div>
                </div>
              ) : !viewingVersion && previewIsGenerating ? (
                <div className="flex h-[500px] w-full flex-col items-center justify-center gap-2 rounded-xl border border-border bg-input px-6 text-center">
                  <Loader2 className="h-8 w-8 animate-spin text-orange-400" aria-hidden="true" />
                  <p className="text-sm font-medium text-foreground">{t("generatingTitle")}</p>
                  <p className="max-w-md text-xs text-muted">{t("generatingBody")}</p>
                  <p className="text-xs text-orange-400/80" aria-live="polite">
                    {t(PROGRESS_MESSAGE_KEYS[progressMessageIndex])}
                  </p>
                </div>
              ) : !viewingVersion && previewWebsite.status === "failed" ? (
                <div className="flex h-[500px] w-full flex-col items-center justify-center gap-2 rounded-xl border border-red-800 bg-red-950/20 px-6 text-center">
                  <AlertTriangle className="h-8 w-8 text-red-400" aria-hidden="true" />
                  <p className="text-sm font-medium text-red-300">{t("generationFailedTitle")}</p>
                  <p className="max-w-md text-xs text-red-300/80">
                    {previewWebsite.error_message ?? t("generateFailed")}
                  </p>
                </div>
              ) : !viewingVersion && previewWebsite.status === "flagged" ? (
                <div className="flex h-[500px] w-full flex-col items-center justify-center gap-3 rounded-xl border border-amber-800 bg-amber-950/20 px-6 text-center">
                  <AlertTriangle className="h-8 w-8 text-amber-400" aria-hidden="true" />
                  <p className="text-sm font-medium text-amber-300">{t("flaggedTitle")}</p>
                  <p className="max-w-md text-xs text-amber-300/80">{previewWebsite.error_message}</p>
                  {!previewWebsite.free_retry_used && previewWebsite.description && (
                    <button
                      type="button"
                      onClick={() => handleRegenerateFlagged(previewWebsite.id)}
                      disabled={regeneratingId === previewWebsite.id}
                      className="inline-flex min-h-[36px] items-center justify-center gap-1.5 rounded-lg bg-amber-500 px-4 py-1.5 text-xs font-semibold text-black transition-all duration-200 hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {regeneratingId === previewWebsite.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                      ) : (
                        <Wand2 className="h-3.5 w-3.5" aria-hidden="true" />
                      )}
                      {t("regenerateFree")}
                    </button>
                  )}
                </div>
              ) : displayedHtmlIsComplete ? (
                <iframe
                  key={`${previewWebsite.id}:${viewingVersion?.id ?? "latest"}`}
                  srcDoc={displayedHtml}
                  sandbox=""
                  title={previewWebsite.name}
                  className="h-[500px] w-full rounded-xl border border-border bg-white"
                />
              ) : (
                <div className="flex h-[500px] w-full flex-col items-center justify-center gap-2 rounded-xl border border-red-800 bg-red-950/20 px-6 text-center">
                  <AlertTriangle className="h-8 w-8 text-red-400" aria-hidden="true" />
                  <p className="text-sm font-medium text-red-300">{t("previewIncompleteTitle")}</p>
                  <p className="max-w-md text-xs text-red-300/80">{t("previewIncompleteBody")}</p>
                </div>
              )}
            </>
          )}

          {detailTab === "history" && (
            <div>
              {loadingVersionsFor === previewWebsite.id ? (
                <p className="flex items-center gap-1.5 text-xs text-muted">
                  <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                  {t("historyLoading")}
                </p>
              ) : !activeVersions || activeVersions.length === 0 ? (
                <p className="text-xs text-muted">{t("historyEmpty")}</p>
              ) : (
                <ul className="space-y-1.5">
                  {activeVersions.map((version) => (
                    <li key={version.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setViewingVersion((current) =>
                            current?.id === version.id ? null : version
                          );
                          setDetailTab("preview");
                        }}
                        className={`w-full rounded-lg border px-2.5 py-1.5 text-left text-xs transition-colors duration-150 ${
                          viewingVersion?.id === version.id
                            ? "border-orange-500/40 bg-orange-500/[0.03] text-foreground"
                            : "border-transparent text-muted hover:bg-panel-hover"
                        }`}
                      >
                        <span className="font-medium text-foreground">
                          {t("versionLabel", { number: version.version_number })}
                        </span>
                        {" — "}
                        {version.change_description ?? t("versionOriginal")}
                        <span
                          className="ml-1.5 text-muted"
                          title={formatDateTime(version.created_at, locale)}
                          suppressHydrationWarning
                        >
                          ({formatRelativeTime(version.created_at)})
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {detailTab === "edit" && (
            <form id={EDIT_FORM_ID} onSubmit={handleEdit} className="space-y-2">
              {previewWebsite.status !== "completed" && (
                <p className="rounded-lg border border-border bg-input px-3 py-2 text-xs text-muted">
                  {t("editUnavailable")}
                </p>
              )}
              <label htmlFor="website-edit" className="block text-xs text-muted">
                {t("editLabel")}
              </label>
              <textarea
                id="website-edit"
                maxLength={MAX_CHANGE_REQUEST_LENGTH}
                value={editText}
                onChange={(e) => setEditText(e.target.value.slice(0, MAX_CHANGE_REQUEST_LENGTH))}
                placeholder={t("editPlaceholder")}
                disabled={previewWebsite.status !== "completed"}
                className="input min-h-28 resize-y"
              />

              <div>
                <label htmlFor="website-edit-image" className="mb-1 block text-xs text-muted">
                  {t("imageLabel", { count: editImageFiles.length, max: MAX_REFERENCE_IMAGES })}
                </label>
                {editImageFiles.length > 0 && (
                  <ul className="mb-2 space-y-1.5">
                    {editImageFiles.map((file, index) => (
                      <li
                        key={`${file.name}-${index}`}
                        className="flex items-center gap-2 rounded-lg border border-border bg-input px-3 py-2"
                      >
                        <ImageIcon className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
                        <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                          {file.name}
                        </span>
                        <button
                          type="button"
                          onClick={() => removeEditReferenceImage(index)}
                          aria-label={t("imageRemove")}
                          title={t("imageRemove")}
                          className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted transition-colors duration-150 hover:bg-panel-hover hover:text-foreground"
                        >
                          <X className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {editImageFiles.length < MAX_REFERENCE_IMAGES && (
                  <FilePicker
                    id="website-edit-image"
                    inputRef={editImageInputRef}
                    multiple
                    accept={ACCEPTED_REFERENCE_IMAGE_TYPES.join(",")}
                    selectedCount={editImageFiles.length}
                    onChange={handleEditImageChange}
                  />
                )}
                {editImageError && <p className="mt-1 text-[11px] text-red-400">{editImageError}</p>}
              </div>

              {editError && (
                <p className="rounded-lg border border-red-900 bg-red-950/40 px-3 py-2 text-xs text-red-400">
                  {editError}
                </p>
              )}
            </form>
          )}
        </DetailPanel>
      )}

      <ListLayout
        newAction={
          showForm ? (
            <form
              onSubmit={handleGenerate}
              className="panel-pop-in space-y-3 rounded-2xl border border-border bg-panel p-5"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-foreground">{t("newProject")}</h2>
                <button
                  type="button"
                  onClick={() => {
                    resetGenerationForm();
                    setShowForm(false);
                  }}
                  aria-label={tCommon("cancel")}
                  title={tCommon("cancel")}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors duration-150 hover:bg-panel-hover hover:text-foreground"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>

              <div>
                <label htmlFor="website-name" className="mb-1 block text-xs text-muted">
                  {t("nameLabel")}
                </label>
                <input
                  id="website-name"
                  type="text"
                  required
                  maxLength={MAX_NAME_LENGTH}
                  value={name}
                  onChange={(e) => setName(e.target.value.slice(0, MAX_NAME_LENGTH))}
                  placeholder={t("namePlaceholder")}
                  className="input"
                />
              </div>
              <div>
                <label htmlFor="website-description" className="mb-1 block text-xs text-muted">
                  {t("descriptionLabel")}
                </label>
                <textarea
                  id="website-description"
                  required
                  maxLength={MAX_DESCRIPTION_LENGTH}
                  value={description}
                  onChange={(e) => setDescription(e.target.value.slice(0, MAX_DESCRIPTION_LENGTH))}
                  placeholder={t("descriptionPlaceholder")}
                  className="input min-h-32 resize-y"
                />
              </div>

              <div>
                <label htmlFor="website-reference-image" className="mb-1 block text-xs text-muted">
                  {t("imageLabel", { count: referenceImageFiles.length, max: MAX_REFERENCE_IMAGES })}
                </label>
                {referenceImageFiles.length > 0 && (
                  <ul className="mb-2 space-y-1.5">
                    {referenceImageFiles.map((file, index) => (
                      <li
                        key={`${file.name}-${index}`}
                        className="flex items-center gap-2 rounded-lg border border-border bg-input px-3 py-2"
                      >
                        <ImageIcon className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
                        <span className="min-w-0 flex-1 truncate text-sm text-foreground">{file.name}</span>
                        <button
                          type="button"
                          onClick={() => removeReferenceImage(index)}
                          aria-label={t("imageRemove")}
                          title={t("imageRemove")}
                          className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted transition-colors duration-150 hover:bg-panel-hover hover:text-foreground"
                        >
                          <X className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {referenceImageFiles.length < MAX_REFERENCE_IMAGES && (
                  <FilePicker
                    id="website-reference-image"
                    inputRef={imageInputRef}
                    multiple
                    accept={ACCEPTED_REFERENCE_IMAGE_TYPES.join(",")}
                    selectedCount={referenceImageFiles.length}
                    onChange={handleImageChange}
                  />
                )}
                <p className="mt-1 text-[11px] text-muted">{t("imageHelp", { max: MAX_REFERENCE_IMAGES })}</p>
                {imageError && <p className="mt-1 text-[11px] text-red-400">{imageError}</p>}
              </div>

              {description.trim().length > 0 && (
                <p className="rounded-lg border border-border bg-input px-3 py-2 text-xs text-muted">
                  {t("estimatedCost", { count: estimatedCost })}
                </p>
              )}

              {isLargeGenerationRequest(description.length, referenceImageFiles.length) ? (
                <p className="rounded-lg border border-amber-800/40 bg-amber-500/5 px-3 py-2 text-xs text-amber-300">
                  {t("estimatedTimeLargeRequest")}
                </p>
              ) : (
                referenceImageFiles.length > 0 && (
                  <p className="rounded-lg border border-amber-800/40 bg-amber-500/5 px-3 py-2 text-xs text-amber-300">
                    {t("estimatedTimeWithImages")}
                  </p>
                )
              )}

              {/* The credit refusal is NOT rendered as an error. It is not
                  a failure — nothing broke, and one of the three things it
                  offers costs nothing. Painting it red taught users to
                  read it as "this is broken" and close it. */}
              {shortfall ? (
                <CreditShortfallPanel
                  shortfall={shortfall}
                  onSimplify={() => {
                    setShortfall(null);
                    const field = document.getElementById("website-description");
                    if (field instanceof HTMLTextAreaElement) {
                      field.focus();
                      // Cursor at the end, not selecting everything: the
                      // next keystroke must not wipe what they wrote.
                      field.setSelectionRange(field.value.length, field.value.length);
                    }
                  }}
                  onDismiss={() => setShortfall(null)}
                />
              ) : (
                error && (
                  <p className="rounded-lg border border-red-900 bg-red-950/40 px-3 py-2 text-xs text-red-400">
                    {error}
                  </p>
                )
              )}

              {pendingClarification ? (
                <ClarificationQuestions
                  questions={pendingClarification.questions}
                  onAnswer={handleClarificationAnswer}
                  onSkip={handleClarificationSkip}
                  submitting={generating}
                  title={t("clarificationTitle")}
                  skipLabel={t("clarificationSkip")}
                  continueLabel={t("clarificationContinue")}
                  answerPlaceholder={t("clarificationAnswerPlaceholder")}
                />
              ) : (
                <button
                  type="submit"
                  disabled={generating || !name.trim() || !description.trim()}
                  className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl bg-orange-500 px-4 py-2 text-sm font-semibold text-black transition-all duration-200 hover:opacity-90 hover:shadow-[0_0_16px_rgba(249,115,22,0.35)] disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-0"
                >
                  {generating ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Sparkles className="h-4 w-4" aria-hidden="true" />
                  )}
                  {generating ? t("generating") : t("generateButton")}
                </button>
              )}
            </form>
          ) : (
            <button
              type="button"
              onClick={() => {
                resetGenerationForm();
                setShowForm(true);
              }}
              className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl bg-orange-500 px-4 py-2 text-sm font-semibold text-black transition-all duration-200 hover:opacity-90 hover:shadow-[0_0_16px_rgba(249,115,22,0.35)] sm:min-h-0"
            >
              <Plus className="h-4 w-4" aria-hidden="true" /> {t("newProject")}
            </button>
          )
        }
        searchValue={query}
        onSearchChange={setQuery}
        searchPlaceholder={tModule("searchPlaceholder")}
        filters={
          <>
            <SortToggle sortOrder={sortOrder} onChange={setSortOrder} />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              aria-label={tModule("filterBy", { label: t("statusLabel") })}
              className="min-h-[36px] rounded-full border border-border bg-input px-3 py-1.5 text-xs text-foreground outline-none transition-colors duration-150 focus:border-orange-500/60 sm:min-h-0"
            >
              <option value="">{tModule("filterAll", { label: t("statusLabel") })}</option>
              {WEBSITE_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {t(WEBSITE_STATUS_LABEL_KEYS[status])}
                </option>
              ))}
            </select>
          </>
        }
        meta={
          <span className="text-xs text-muted">
            {tModule("resultCount", { count: filteredWebsites.length, total: websites.length })}
          </span>
        }
      >
        {websites.length === 0 ? (
          <EmptyState icon={Layout}>{t("emptyState")}</EmptyState>
        ) : filteredWebsites.length === 0 ? (
          <EmptyState icon={SearchX}>{tModule("noMatches", { query })}</EmptyState>
        ) : (
          <>
            <CardGrid>
              {paginatedWebsites.map((website, i) => (
                <EntityCard
                  key={website.id}
                  index={i}
                  selected={website.id === previewId}
                  icon={WEBSITE_BUILDER_ICON}
                  accentSlug="websiteBuilder"
                  media={<WebsiteThumbnail website={website} />}
                  title={website.name}
                  description={website.description}
                  onSelect={() => selectWebsite(website.id)}
                  tags={[
                    {
                      key: "created",
                      label: formatRelativeTime(website.created_at),
                    },
                  ]}
                  status={{
                    label: t(WEBSITE_STATUS_LABEL_KEYS[website.status] ?? "statusGenerating"),
                    tone: WEBSITE_STATUS_TONES[website.status] ?? "neutral",
                    pulse: website.status === "pending" || website.status === "processing",
                  }}
                  corner={
                    <FavoriteButton
                      table="user_websites"
                      recordId={website.id}
                      headline={website.name}
                      initialFavorited={favoritedWebsiteIds.includes(website.id)}
                      variant="inline"
                    />
                  }
                  menuLabel={tModule("actionsFor", { name: website.name })}
                  menu={[
                    {
                      key: "open",
                      label: t("tabPreview"),
                      icon: Eye,
                      onSelect: () => selectWebsite(website.id),
                    },
                    {
                      key: "edit",
                      label: t("editButton"),
                      icon: Wand2,
                      disabled: website.status !== "completed",
                      onSelect: () => selectWebsite(website.id, "edit"),
                    },
                    {
                      key: "download",
                      label: t("downloadButton"),
                      icon: Download,
                      disabled: website.status !== "completed",
                      onSelect: () => downloadHtml(website),
                    },
                    {
                      key: "delete",
                      label: t("deleteButton"),
                      icon: Trash2,
                      destructive: true,
                      disabled: deletingId === website.id,
                      onSelect: () => handleDelete(website.id),
                    },
                  ]}
                />
              ))}
            </CardGrid>
            <PaginationControls page={page} totalPages={totalPages} onChange={setPage} />
          </>
        )}
      </ListLayout>
    </div>
  );
}
