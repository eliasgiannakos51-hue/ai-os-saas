"use client";

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";

export type ToastType = "success" | "error";

export type Toast = {
  id: number;
  message: string;
  type: ToastType;
  leaving: boolean;
};

type ToastContextValue = {
  toasts: Toast[];
  addToast: (message: string, type?: ToastType) => void;
  dismissToast: (id: number) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const VISIBLE_DURATION_MS = 3500;
const EXIT_DURATION_MS = 200;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);

  const removeToast = useCallback((id: number) => {
    setToasts((current) => current.filter((t) => t.id !== id));
  }, []);

  const dismissToast = useCallback(
    (id: number) => {
      setToasts((current) =>
        current.map((t) => (t.id === id ? { ...t, leaving: true } : t))
      );
      setTimeout(() => removeToast(id), EXIT_DURATION_MS);
    },
    [removeToast]
  );

  const addToast = useCallback(
    (message: string, type: ToastType = "success") => {
      const id = nextId.current++;
      setToasts((current) => [...current, { id, message, type, leaving: false }]);
      setTimeout(() => dismissToast(id), VISIBLE_DURATION_MS);
    },
    [dismissToast]
  );

  return (
    <ToastContext.Provider value={{ toasts, addToast, dismissToast }}>
      {children}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return ctx;
}
