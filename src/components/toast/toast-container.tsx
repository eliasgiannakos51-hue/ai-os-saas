"use client";

import { useToast } from "@/components/toast/toast-context";

export function ToastContainer() {
  const { toasts, dismissToast } = useToast();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[60] flex w-72 max-w-[calc(100vw-2rem)] flex-col gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role="status"
          tabIndex={0}
          onClick={() => dismissToast(toast.id)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              dismissToast(toast.id);
            }
          }}
          aria-label={`${toast.message} — press Enter to dismiss`}
          className={`cursor-pointer rounded-md border px-3 py-2 text-xs shadow-lg backdrop-blur-sm transition-all duration-200 hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-500/70 ${
            toast.leaving
              ? "translate-y-1 opacity-0"
              : "animate-fade-in translate-y-0 opacity-100"
          } ${
            toast.type === "error"
              ? "border-red-800 bg-red-950/90 text-red-300"
              : "border-orange-800 bg-black/90 text-orange-400"
          }`}
        >
          {toast.message}
        </div>
      ))}
    </div>
  );
}
