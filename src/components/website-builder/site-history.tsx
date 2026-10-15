"use client";

import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Undo2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/toast/toast-context";
import { OPTION } from "@/components/shell/tool-shell";
import { useFormatRelativeTime } from "@/lib/use-relative-time";
import { formatDateTime } from "@/lib/format-number";
import { UNDO_MARK } from "@/lib/websites/undo";
import { useErrorText } from "@/lib/errors/use-error-text";
import { ApiError } from "@/lib/errors/api-error";
import type { WebsiteVersion } from "@/types/user-website";

type LiveVersion = { id: string; version_number: number; published_at: string; change_description: string | null };

/**
 * As many published versions as a publish keeps (MAX_SITE_VERSIONS in
 * lib/publishing/publish-limits.ts). Not imported: that module reads the
 * server's environment, which a browser does not have
 * (scripts/tests/client-env-reach.test.mjs); scripts/tests/tool-shell.test.mjs
 * holds the two numbers equal.
 */
const LIVE_VERSIONS_SHOWN = 20;

/**
 * A SITE'S VERSIONS, IN THE SHELL (components/website-builder/website-shell.tsx,
 * behind the switch "tool-shell"). Two lists, each the old screen's own:
 *
 *   EVERY VERSION the site has had — the first generation, every change,
 *   every undo — read from website_versions exactly as the old page's
 *   History tab reads it (components/website-builder/website-builder-workspace.tsx,
 *   loadVersions). Pressing one shows it in the preview, read-only, with
 *   the way back to the latest; what is written in the field still changes
 *   the latest, as on the old page.
 *
 *   WHAT THE PUBLIC SAW — the published site's site_versions, as
 *   /dashboard/published lists them (components/publishing/published-sites-list.tsx),
 *   with «Roll back» on every one but the newest, through the same
 *   /api/published/[id]/rollback. A rollback is a publish: it appends a
 *   version, it deletes none. Shown only once the site has been published
 *   (GET /api/websites/[id]/publish, the route Publish itself reads).
 *
 * The rollback's own row says «Rolled back to version N» in English
 * (api/published/[id]/rollback); it is said here in the screen's language.
 *
 * Held by scripts/tests/tool-shell.test.mjs, section 9, and used in the
 * built app by scripts/tests/tool-shell-edges.prodtest.mjs.
 */
export function SiteHistory({
  websiteId,
  reload,
  viewingId,
  onView,
}: {
  websiteId: string;
  /** Changes whenever the site gets a new version here (a change, an undo), so the lists are read again. */
  reload: number;
  viewingId: string | null;
  onView: (version: WebsiteVersion) => void;
}) {
  const t = useTranslations("dashboard.websiteBuilder");
  const tShell = useTranslations("dashboard.toolShell");
  const tPub = useTranslations("dashboard.publishing");
  const describe = useErrorText();
  const locale = useLocale();
  const relative = useFormatRelativeTime();
  const { addToast } = useToast();
  const supabase = useMemo(() => createClient(), []);

  const [versions, setVersions] = useState<WebsiteVersion[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [live, setLive] = useState<{ siteId: string; isLive: boolean; versions: LiveVersion[] } | null>(null);
  const [rolling, setRolling] = useState(false);
  const [round, setRound] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setVersions(null);
    setFailed(false);
    void (async () => {
      const { data, error } = await supabase
        .from("website_versions")
        .select("*")
        .eq("website_id", websiteId)
        .order("version_number", { ascending: false });
      if (cancelled) return;
      if (error) {
        setFailed(true);
        setVersions([]);
        return;
      }
      setVersions((data as WebsiteVersion[]) ?? []);
    })();
    void (async () => {
      try {
        const response = await fetch(`/api/websites/${encodeURIComponent(websiteId)}/publish`);
        const body = await response.json().catch(() => null);
        const site = body?.ok ? (body.site as { id: string; status: string } | null) : null;
        if (!site) {
          if (!cancelled) setLive(null);
          return;
        }
        const { data } = await supabase
          .from("site_versions")
          .select("id, published_site_id, version_number, published_at, change_description")
          .eq("published_site_id", site.id)
          .order("version_number", { ascending: false })
          .limit(LIVE_VERSIONS_SHOWN);
        if (!cancelled) setLive({ siteId: site.id, isLive: site.status === "live", versions: (data as LiveVersion[] | null) ?? [] });
      } catch {
        // Not published, or not reachable now: the list of what the public
        // saw is left out rather than shown wrong.
        if (!cancelled) setLive(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase, websiteId, reload, round]);

  async function rollback(version: LiveVersion) {
    if (!live || !window.confirm(tPub("confirmRollback", { number: version.version_number }))) return;
    setRolling(true);
    try {
      const response = await fetch(`/api/published/${encodeURIComponent(live.siteId)}/rollback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ versionId: version.id }),
      });
      const data = await response.json().catch(() => null);
      if (!data?.ok) {
        addToast(tPub("rollbackError"), "error");
        return;
      }
      addToast(tPub("rollbackSuccess", { number: version.version_number }));
      setRound((n) => n + 1);
    } catch {
      addToast(tPub("rollbackError"), "error");
    } finally {
      setRolling(false);
    }
  }

  // What a version was, in the screen's words where the server wrote its own.
  const said = (description: string | null) =>
    description === null ? t("versionOriginal") : description.startsWith(UNDO_MARK) ? tShell("site.undid", { change: description.slice(UNDO_MARK.length).trim() }) : description;
  const liveSaid = (description: string | null) => {
    const back = description?.match(/^Rolled back to version (\d+)$/);
    return back ? tPub("rollbackSuccess", { number: Number(back[1]) }) : description;
  };

  return (
    <div data-testid="site-history" className="space-y-6">
      <section aria-label={tShell("site.versions")}>
        <h2 className="text-xs font-semibold text-muted">{tShell("site.versions")}</h2>
        <p className="mt-0.5 text-[11px] text-muted">{tShell("site.versionsHint")}</p>
        {versions === null ? (
          <p className="mt-2 text-xs text-muted">{t("historyLoading")}</p>
        ) : failed ? (
          <p className="mt-2 text-xs text-warning">{describe(new ApiError(500, null), { spends: false }).text}</p>
        ) : versions.length === 0 ? (
          <p className="mt-2 text-xs text-muted">{t("historyEmpty")}</p>
        ) : (
          <ul className="row-list mt-1">
            {versions.map((version) => (
              <li key={version.id}>
                <button
                  type="button"
                  onClick={() => onView(version)}
                  aria-pressed={viewingId === version.id}
                  data-testid="site-version"
                  className={`min-h-[44px] w-full px-3 py-2 text-start text-xs ${viewingId === version.id ? "text-foreground" : "text-muted hover:text-foreground"}`}
                >
                  <span className="font-medium text-foreground">{t("versionLabel", { number: version.version_number })}</span>
                  {" — "}
                  <span className="break-words">{said(version.change_description)}</span>
                  <span className="ms-1.5" title={formatDateTime(version.created_at, locale)} suppressHydrationWarning>
                    ({relative(version.created_at)})
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {live && (
        <section aria-label={tShell("site.liveVersions")} data-testid="site-live-versions">
          <h2 className="text-xs font-semibold text-muted">{tShell("site.liveVersions")}</h2>
          {live.versions.length === 0 ? (
            <p className="mt-2 text-xs text-muted">{tPub("noVersions")}</p>
          ) : (
            <ul className="row-list mt-1">
              {live.versions.map((version, index) => (
                <li key={version.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-foreground">
                      {tPub("versionNumber", { number: version.version_number })}
                      {index === 0 && live.isLive ? ` · ${tPub("currentlyLive")}` : ""}
                    </p>
                    <p className="break-words text-[11px] text-muted" suppressHydrationWarning>
                      {formatDateTime(version.published_at, locale)}
                      {liveSaid(version.change_description) ? ` · ${liveSaid(version.change_description)}` : ""}
                    </p>
                  </div>
                  {index > 0 && (
                    <button type="button" onClick={() => void rollback(version)} disabled={rolling} data-testid="site-rollback" className={`${OPTION} disabled:opacity-40`}>
                      <Undo2 className="h-3.5 w-3.5" aria-hidden="true" />
                      {tPub("rollback")}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
