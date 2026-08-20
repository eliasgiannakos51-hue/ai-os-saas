"use client";

import { ApiError } from "@/lib/errors/api-error";
import { useErrorText } from "@/lib/errors/use-error-text";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/toast/toast-context";
import {
  recordActionClasses,
  recordActionIconClasses,
  type RecordActionVariant,
} from "@/components/ui/record-action-variants";

export function DeleteButton({
  table,
  id,
  label = "entry",
  confirmMessage,
  itemName,
  variant = "icon",
  onActivate,
  onDeleted,
}: {
  table: string;
  id: string;
  label?: string;
  /**
   * A COMPLETE confirmation sentence, already translated.
   *
   * module.deleteConfirm pours a noun into "Delete this {label}?", which
   * only works while the noun is English. "ιδέα" is feminine and produces
   * "Να διαγραφεί αυτό το ιδέα;" — not Greek. A caller that has a real
   * translation for its own entry type passes the whole sentence instead.
   */
  confirmMessage?: string;
  itemName?: string;
  /** See record-action-variants.ts — chrome only, same action. */
  variant?: RecordActionVariant;
  /** Called before the confirm — lets a host menu close itself first. */
  onActivate?: () => void;
  /** Called after a successful delete, before the router refresh. */
  onDeleted?: () => void;
}) {
  const router = useRouter();
  const t = useTranslations("module");
  const supabase = createClient();
  const { addToast } = useToast();
  const describe = useErrorText();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hostRef = useRef<HTMLDivElement>(null);

  async function handleDelete() {
    onActivate?.();
    if (!window.confirm(confirmMessage ?? t("deleteConfirm", { label }))) {
      return;
    }

    setError(null);
    setLoading(true);
    const { error } = await supabase.from(table).delete().eq("id", id);
    setLoading(false);

    if (error) {
      setError(describe(new ApiError(500, { error: error.message })).text);
      addToast(`✗ ${describe(new ApiError(500, { error: error.message })).what}`, "error");
      return;
    }

    addToast(`✓ ${t("deleted")}`);
    onDeleted?.();
    animateRowOut(hostRef.current, () => router.refresh());
  }

  /**
   * Fades the deleted row out, then collapses the space it occupied,
   * before asking the router to re-fetch.
   *
   * Without this the row simply vanishes on refresh and everything below
   * it jumps up — the user cannot tell what left. The row's measured
   * height is written to a custom property because a CSS animation cannot
   * interpolate from `auto`.
   *
   * The refresh is what actually removes the row; the animation only
   * covers the gap until then, so a missed animationend still resolves
   * via the timeout and the list is never left stale.
   */
  function animateRowOut(node: HTMLElement | null, done: () => void) {
    const row = node?.closest<HTMLElement>("[data-row], li, tr");
    const reduced =
      document.documentElement.getAttribute("data-motion") === "reduce" ||
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    if (!row || reduced) {
      done();
      return;
    }

    row.style.setProperty("--row-h", `${row.getBoundingClientRect().height}px`);
    row.classList.add("row-collapse-out");

    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      done();
    };
    row.addEventListener("animationend", finish, { once: true });
    window.setTimeout(finish, 500);
  }

  const menuItem = variant === "menuItem";

  return (
    <div ref={hostRef} className={variant === "icon" ? "flex flex-col items-end gap-1" : ""}>
      <button
        type="button"
        data-menu-item={menuItem ? "" : undefined}
        role={menuItem ? "menuitem" : undefined}
        onClick={handleDelete}
        disabled={loading}
        aria-label={itemName ? `${t("delete")}: ${itemName}` : t("delete")}
        title={t("delete")}
        className={recordActionClasses(variant, "destructive")}
      >
        <Trash2 className={recordActionIconClasses(variant)} />
        {variant !== "icon" && t("delete")}
      </button>
      {error && (
        <p className={`text-xs text-red-400 ${menuItem ? "px-2.5 pb-1" : "max-w-[16rem] text-right"}`}>
          {error}
        </p>
      )}
    </div>
  );
}
