"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { LayoutGrid, Shapes, ZoomIn } from "lucide-react";
import { Earth } from "@/components/brand/earth";
import { ACTION, OPTION, ToolShell, type ShellTurn } from "@/components/shell/tool-shell";

type Turn = { id: string; role: "user" | "tool"; text: string };

/**
 * EDITING (owner, "18. EDITING: ΛΕΙΤΟΥΡΓΙΚΟ, ΜΕ ΜΗΧΑΝΗ REMOTION",
 * 2026-10-30), Κομμάτι 2 ONLY — the owner's own stop-gate: the screen
 * and its two new tool buttons, nothing wired further until "εγκρίνω".
 *
 * A real editor opens straight into a workspace, not a "describe what
 * you want" wait — so the workspace is OPEN BY DEFAULT here, the one
 * deliberate deviation from Image's "empty until something exists"
 * shape. It can still be closed back to the composer (the back arrow
 * on a phone, the ✕ on desktop — both built into ToolShell already)
 * and reopened from the one `options` button, so the field piece 3
 * will use stays reachable on every device, never a dead end.
 *
 * The tools rail carries exactly the two buttons the directive names —
 * Zoom, Graphics — both inert today. Background/cuts/subtitles/etc.
 * (pieces 5-9) are NOT drawn here: the directive's piece 2 names only
 * these two, and the reference image never arrived to show the rest.
 */
export function EditingShell() {
  const t = useTranslations("dashboard.editing");
  const tNames = useTranslations("dashboard.tools.names");
  const tExamples = useTranslations("dashboard.comingSoon.examples.editing");

  const [turns, setTurns] = useState<Turn[]>([]);
  const [pane, setPane] = useState<"workspace" | null>("workspace");
  const say = (role: Turn["role"], text: string) => setTurns((prev) => [...prev, { id: `${role}${prev.length}`, role, text }]);

  function send(text: string) {
    say("user", text);
    say("tool", t("notBuilt"));
  }

  const shellTurns: ShellTurn[] = turns.map((turn) => ({ id: turn.id, role: turn.role, text: turn.text }));

  const work =
    pane === "workspace"
      ? {
          title: t("workspaceTitle"),
          body: (
            <div className="flex h-full gap-4">
              <div className="flex shrink-0 flex-col gap-1" data-testid="editing-tools-rail">
                <button type="button" disabled data-testid="editing-tool-zoom" aria-label={t("tools.zoom")} title={t("tools.zoom")} className={`${ACTION} relative opacity-60`}>
                  <ZoomIn className="h-4 w-4" aria-hidden="true" />
                  <span className="absolute end-1 top-1 h-1.5 w-1.5 rounded-full bg-muted" aria-hidden="true" />
                </button>
                <button type="button" disabled data-testid="editing-tool-graphics" aria-label={t("tools.graphics")} title={t("tools.graphics")} className={`${ACTION} relative opacity-60`}>
                  <Shapes className="h-4 w-4" aria-hidden="true" />
                  <span className="absolute end-1 top-1 h-1.5 w-1.5 rounded-full bg-muted" aria-hidden="true" />
                </button>
              </div>

              <div className="flex min-w-0 flex-1 flex-col items-center justify-center gap-3 text-center" data-testid="editing-no-material">
                <Earth variant="small" px={72} />
                <p className="max-w-xs text-sm text-muted">{t("noMaterial")}</p>
              </div>
            </div>
          ),
        }
      : null;

  return (
    <ToolShell
      name={tNames("editing")}
      turns={shellTurns}
      placeholder={t("placeholder")}
      sending={false}
      onSend={send}
      options={[
        <button key="workspace" type="button" onClick={() => setPane("workspace")} data-testid="editing-workspace-open" className={OPTION}>
          <LayoutGrid className="h-3.5 w-3.5" aria-hidden="true" />
          {t("workspaceTitle")}
        </button>,
      ]}
      empty={{
        heading: t("empty.heading"),
        examples: [
          { key: "a", label: tExamples("a") },
          { key: "b", label: tExamples("b") },
          { key: "c", label: tExamples("c") },
        ],
      }}
      work={work}
      onCloseWork={() => setPane(null)}
    />
  );
}
