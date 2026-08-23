"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { clearPrivatePwaCaches } from "@/lib/pwa/cache-reset";

export function LogoutButton() {
  const router = useRouter();
  const supabase = createClient();
  const [loading, setLoading] = useState(false);

  async function handleLogout() {
    setLoading(true);
    await supabase.auth.signOut();
    // BEFORE leaving: the service worker keeps the HTML of dashboard pages
    // so they still open with no network, and that HTML is this account's.
    // Signing out has to take it with it, or the next person on this
    // browser can read it by going offline.
    await clearPrivatePwaCaches();
    router.push("/login");
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={handleLogout}
      disabled={loading}
      className="inline-flex min-h-[44px] items-center justify-center rounded border border-border px-3 py-1.5 text-xs text-muted transition-colors hover:border-orange-500 hover:text-orange-400 disabled:opacity-50"
    >
      {loading ? "logging_out..." : "logout()"}
    </button>
  );
}
