"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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
    router.refresh();
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handleDelete}
        disabled={loading}
        aria-label={itemName ? `Delete ${label}: ${itemName}` : `Delete ${label}`}
        className="inline-flex min-h-[44px] shrink-0 items-center justify-center rounded border border-red-900 px-3 py-0.5 text-[11px] text-red-400 transition-colors hover:border-red-500 hover:bg-red-950/30 disabled:opacity-50 sm:min-h-0 sm:px-2"
      >
        {loading ? "deleting..." : "delete()"}
      </button>
      {error && (
        <p className="max-w-[16rem] text-right text-xs text-red-400">
          error: {error}
        </p>
      )}
    </div>
  );
}
