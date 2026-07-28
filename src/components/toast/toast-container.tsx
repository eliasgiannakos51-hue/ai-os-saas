"use client";

import { useToast } from "@/components/toast/toast-context";

export function ToastContainer() {
  const { toasts, dismissToast } = useToast();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[60] flex w-72 max-w-[calc(100vw-2rem)] flex-col gap-2 font-mono">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role="status"
          onClick={() => dismissToast(toast.id)}
          className={`cursor-pointer rounded-md border px-3 py-2 text-xs shadow-lg backdrop-blur-sm transition-colors ${
            toast.type === "error"
              ? "border-red-800 bg-red-950/90 text-red-300"
              : "border-amber-800 bg-black/90 text-amber-400"
          }`}
        >
          {toast.message}
        </div>
      ))}
    </div>
  );
}
