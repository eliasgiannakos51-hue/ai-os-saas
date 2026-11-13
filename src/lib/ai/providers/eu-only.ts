import "server-only";

/**
 * «ΜΟΝΟ ΕΥΡΩΠΗ» — the per-account promise that every model call this
 * account's AI features make is served by a provider physically in the
 * EU, never answered "close enough" by routing to whoever is configured.
 *
 * ONE READ, ONE PLACE. user_credits.eu_only_ai (migration
 * 20261122000000_eu_only_ai.sql) is the account's own setting, written
 * only by api/settings/eu-only/route.ts through the admin client,
 * filtered to the caller's own id — the same deny-all shape
 * discord_guilds and the pairing tables use, because a client write here
 * could flip ANOTHER account's promise.
 *
 * DYNAMIC IMPORT, NOT A TOP-LEVEL ONE. complete.ts imports this file
 * statically so runCompletion can call it directly, and
 * scripts/tests/ai-providers.test.mjs §0b walks that whole graph and
 * fails on any vendor package it finds there (ΛΘ-17: the first version
 * of this layer broke every gate that loaded a module reaching
 * runCompletion, through the Supabase client exactly like this one). So
 * @supabase/supabase-js is reached only inside the function body, the
 * same way complete.ts's own ADAPTERS table reaches each vendor SDK.
 *
 * FAILS OPEN ON THE LOOKUP, NOT ON THE ENFORCEMENT. A transient database
 * error here must not take down every AI call in the product over an
 * optional per-account preference most accounts never set — so a lookup
 * that cannot complete is treated as "not EU-only" for that one call,
 * logged loudly so it is visible rather than a silent, permanent gap.
 * This is different from the promise itself: ONCE the setting is read as
 * true, resolveChain refuses to route around it — see
 * registry.ts's resolveChain and complete.ts's runCompletion.
 */
export async function resolveAccountEuOnly(userId: string): Promise<boolean> {
  try {
    const { createAdminClient } = await import("@/lib/supabase/admin");
    const { data, error } = await createAdminClient()
      .from("user_credits")
      .select("eu_only_ai")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) {
      // eslint-disable-next-line no-console
      console.error(`[ai-providers] could not read eu_only_ai for ${userId}: ${error.message} — treating as off for this call`);
      return false;
    }
    return (data as { eu_only_ai?: boolean } | null)?.eu_only_ai === true;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`[ai-providers] eu_only_ai lookup threw for ${userId}: ${err instanceof Error ? err.message : String(err)} — treating as off for this call`);
    return false;
  }
}
