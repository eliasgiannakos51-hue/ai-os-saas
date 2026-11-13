"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { signOutAndForget } from "@/lib/auth/sign-out";

export function LogoutButton() {
  const router = useRouter();
  const supabase = createClient();
  const [loading, setLoading] = useState(false);

  async function handleLogout() {
    setLoading(true);
    // BEFORE leaving: the service worker keeps the HTML of dashboard pages
    // so they still open with no network, and that HTML is this account's.
    // Signing out takes it with it (lib/auth/sign-out.ts), or the next
    // person on this browser can read it by going offline.
    await signOutAndForget(supabase);
    router.push("/login");
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={handleLogout}
      disabled={loading}
      className="inline-flex min-h-[44px] items-center justify-center rounded-item border border-border px-3 py-1.5 text-xs text-muted transition-colors hover:border-foreground/40 hover:text-foreground disabled:opacity-50"
    >
      {loading ? "logging_out..." : "logout()"}
    </button>
  );
}
