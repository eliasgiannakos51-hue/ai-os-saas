import "server-only";
import { isFeatureOn } from "@/lib/flags/flags";
import { PROVIDERS, type ProviderId } from "@/lib/integrations/providers";

/**
 * THE PROVIDERS THIS PERSON MAY USE, by switch (MASTER 13 Β). A provider
 * with no `behindSwitch` is everyone's; Google Calendar (package 31) is
 * behind "google-calendar". One answer for the three places that ask: the
 * page's cards, the connect route, and the reads Chat may make — so
 * closing the switch takes it off the page, stops new connections and
 * stops Chat reading an account already connected, with no deploy.
 */
export async function providersOpenTo(user: { email?: string | null } | null): Promise<Set<ProviderId>> {
  const calendar = await isFeatureOn("google-calendar", user);
  return new Set(PROVIDERS.filter((p) => !p.behindSwitch || (p.behindSwitch === "google-calendar" && calendar)).map((p) => p.id));
}
