"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function DeleteButton({
  table,
  id,
  label = "entry",
}: {
  table: string;
  id: string;
  label?: string;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [loading, setLoading] = useState(false);

  async function handleDelete() {
    if (!window.confirm(`Delete this ${label}? This can't be undone.`)) {
      return;
    }

    setLoading(true);
    const { error } = await supabase.from(table).delete().eq("id", id);
    setLoading(false);

    if (error) {
      window.alert(`Failed to delete: ${error.message}`);
      return;
    }

    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={handleDelete}
      disabled={loading}
      className="shrink-0 rounded border border-red-900 px-2 py-0.5 text-[11px] text-red-400 transition-colors hover:border-red-500 hover:bg-red-950/30 disabled:opacity-50"
    >
      {loading ? "deleting..." : "delete()"}
    </button>
  );
}
