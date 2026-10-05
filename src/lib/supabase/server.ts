import { cookies } from "next/headers";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

// ASYNC SINCE NEXT 15/16: cookies() returns a promise, and Next 16
// removed the synchronous access the codemod's cast relied on. Every
// caller awaits it.
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }: { name: string; value: string; options: CookieOptions }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Called from a Server Component — session refresh is handled by middleware instead.
          }
        },
      },
    }
  );
}
