"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/toast/toast-context";

export function DeleteButton({
  table,
  id,
  label = "entry",
  itemName,
}: {
  table: string;
  id: string;
  label?: string;
  itemName?: string;
}) {
  const router = useRouter();
  const supabase = createClient();
  const { addToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hostRef = useRef<HTMLDivElement>(null);

  async function handleDelete() {
    if (!window.confirm(`Delete this ${label}? This can't be undone.`)) {
      return;
    }

    setError(null);
    setLoading(true);
    const { error } = await supabase.from(table).delete().eq("id", id);
    setLoading(false);

    if (error) {
      setError(error.message);
      addToast(`✗ error: ${error.message}`, "error");
      return;
    }

    addToast("✓ deleted");
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

  return (
    <div ref={hostRef} className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handleDelete}
        disabled={loading}
        aria-label={itemName ? `Delete ${label}: ${itemName}` : `Delete ${label}`}
        title="Delete"
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted transition-colors duration-150 hover:bg-red-500/10 hover:text-red-400 disabled:opacity-50"
      >
        <Trash2 className="h-4 w-4" />
      </button>
      {error && (
        <p className="max-w-[16rem] text-right text-xs text-red-400">
          error: {error}
        </p>
      )}
    </div>
  );
}
