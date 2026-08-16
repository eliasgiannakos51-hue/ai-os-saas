"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus } from "lucide-react";
import { useToast } from "@/components/toast/toast-context";
import { getErrorMessage } from "@/lib/get-error-message";

/**
 * Create a document and go to it.
 *
 * A hook rather than logic inside the button, because two things now start
 * a document: the button, and the worked example on the empty screen
 * (documents-list.tsx). Passing the button a callback so the empty state
 * could reach into it worked and read like a trick; the honest shape is
 * that "create a document" is an operation both call, not a thing one of
 * them owns and the other borrows.
 *
 * `title` is optional and goes to the API, which caps and trims it — the
 * example's whole point is that the editor opens on a document already
 * called what the example said.
 */
export function useCreateDocument() {
  const router = useRouter();
  const { addToast } = useToast();
  const [loading, setLoading] = useState(false);

  const create = useCallback(
    async (title?: string) => {
      if (loading) return;
      setLoading(true);
      try {
        const res = await fetch("/api/documents", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(title ? { title } : {}),
        });
        const data = await res.json();
        if (!res.ok || !data.ok) {
          addToast(`✗ ${getErrorMessage(data?.error, "Could not create document.")}`, "error");
          return;
        }
        router.push(`/dashboard/documents/${data.id}`);
      } catch (err) {
        addToast(`✗ ${getErrorMessage(err)}`, "error");
      } finally {
        setLoading(false);
      }
    },
    [loading, addToast, router]
  );

  return { create, loading };
}

export function NewDocumentButton({ label, large = false }: { label: string; large?: boolean }) {
  const { create, loading } = useCreateDocument();

  return (
    <button
      type="button"
      onClick={() => void create()}
      disabled={loading}
      className={
        large
          ? "inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl bg-orange-500 px-6 py-3 text-sm font-semibold text-black transition-all duration-200 hover:opacity-90 hover:shadow-[0_0_16px_rgba(249,115,22,0.35)] disabled:cursor-not-allowed disabled:opacity-50"
          : "inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-xl bg-orange-500 px-4 py-2 text-sm font-semibold text-black transition-all duration-200 hover:opacity-90 hover:shadow-[0_0_16px_rgba(249,115,22,0.35)] disabled:cursor-not-allowed disabled:opacity-50"
      }
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
      ) : (
        <Plus className="h-4 w-4" aria-hidden="true" />
      )}
      {label}
    </button>
  );
}
