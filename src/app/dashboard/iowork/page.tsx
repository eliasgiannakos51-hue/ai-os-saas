import { pageTitle } from "@/lib/page-title";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Laptop } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/current-user";
import { createClient } from "@/lib/supabase/server";
import { isFeatureOn } from "@/lib/flags/flags";
import { PageHeader } from "@/components/dashboard/page-header";
import { ComingSoonShell } from "@/components/tools/coming-soon-shell";
import { isDeviceIdle, MAX_DEVICES_PER_USER } from "@/lib/iowork/pairing";
import { IoworkDevices, type IoworkDevice } from "@/components/iowork/iowork-devices";

export const dynamic = "force-dynamic";

export function generateMetadata(): Promise<Metadata> {
  return pageTitle("dashboard.tools.names.iowork");
}

type Row = Omit<IoworkDevice, "idle">;

/**
 * IOWORK (the owner's "IOWORK: ΛΕΙΤΟΥΡΓΙΚΟ, ΚΟΜΜΑΤΙ ΚΟΜΜΑΤΙ", 2026-10-25),
 * Φάση 1 κομμάτι 2, behind the switch "iowork-tool".
 *
 * ONLY THE WEB HALF EXISTS. The desktop app is not written and not
 * packaged (docs/IOWORK-TECH.md: the technology is chosen, the signing
 * accounts are not open). What works here is the account's side of §3 of
 * the approved docs/IOWORK-SECURITY-PLAN.md — type the code a computer is
 * showing, see what is connected, disconnect one — and the screen says in
 * its first line that there is nothing to install yet.
 *
 * THE SWITCH STAYS NARROWER HERE THAN ANYWHERE ELSE, by the owner's own
 * instruction: «Ανοίγει πρώτα ΜΟΝΟ για μένα», and the tile's «Σύντομα»
 * comes off only after an independent security review, after Φάση 3. So
 * `ready` in src/lib/nav/all-tools.ts stays false even once this page
 * works, and this page does not read it: the two decisions are separate
 * on purpose.
 */
export default async function IoworkPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const t = await getTranslations();

  if (!(await isFeatureOn("iowork-tool", user))) {
    return (
      <div className="h-[calc(100dvh-8rem)] md:h-[calc(100vh-4rem)]">
        <ComingSoonShell toolKey="iowork" name={t("dashboard.tools.names.iowork")} examples={[]} />
      </div>
    );
  }

  const supabase = await createClient();
  const { data } = await supabase
    .from("iowork_devices")
    .select("id, label, platform, created_at, last_seen_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });
  const devices: IoworkDevice[] = ((data as Row[] | null) ?? []).map((d) => ({
    ...d,
    idle: isDeviceIdle(d.last_seen_at),
  }));

  return (
    <div className="min-h-full">
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <PageHeader helpKey="help.iowork" icon={Laptop} title={t("dashboard.tools.names.iowork")} />
        <IoworkDevices initialDevices={devices} max={MAX_DEVICES_PER_USER} />
      </div>
    </div>
  );
}
