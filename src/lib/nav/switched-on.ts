import "server-only";
import { cache } from "react";
import { audienceAllows, isFlagKey, isStaffEmail, readFlagAudiences } from "@/lib/flags/flags";
import { SWITCHED_NAMES } from "@/lib/nav/switched-names";

/**
 * The pages of lib/nav/switched-names.ts whose switch is on for this
 * person: the hrefs the menus name by their tool's name. One read of the
 * switches for all of them, and once per request render — the dashboard
 * layout (the ⌘K menu) and a page's own title ask in the same render.
 * A switch that cannot be read counts as "staff", as everywhere else
 * (isFeatureOn), so the owner and the test account still see the tool's
 * name and nobody else does.
 */
export const switchedOnFor = cache(async (email: string | null | undefined): Promise<string[]> => {
  const audiences = await readFlagAudiences();
  const staff = isStaffEmail(email);
  return SWITCHED_NAMES.filter((s) => isFlagKey(s.flag) && audienceAllows(audiences[s.flag], staff)).map((s) => s.href);
});
