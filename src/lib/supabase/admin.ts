import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// Service-role client — bypasses RLS and can manage auth users. Import this
// ONLY from server-only code (Route Handlers, Server Components/Actions).
// The `server-only` import above makes any accidental client-component
// import fail at build time instead of leaking the key to the browser.
export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}
