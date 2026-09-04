"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

// Client-only leaf so the landing page (a Server Component) stays
// statically prerenderable — reading window.location here instead of
// searchParams avoids forcing the whole page to render dynamically.
export function DeletedAccountBanner() {
  const t = useTranslations("landing");
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("deleted") === "success") {
      setShow(true);
    }
  }, []);

  if (!show) return null;

  return (
    <p className="mb-6 max-w-md rounded-xl border border-emerald-800 bg-emerald-950/30 px-4 py-2 text-center text-xs text-emerald-400">
      {t("accountDeleted")}
    </p>
  );
}
