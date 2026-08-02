import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { logApiError } from "@/lib/log-error";

// "AI Life Context" needs a "recent energy check-in" input, but no such
// feature existed anywhere in the app before this — this file (plus the
// user_energy_checkins table and components/overview/energy-checkin-widget.tsx)
// is a small, real, from-scratch feature built to support that, not a
// pre-existing thing being extended.
export type EnergyCheckIn = {
  energyLevel: number;
  note: string | null;
  createdAt: string;
};

export async function loadLatestEnergyCheckIn(
  supabase: SupabaseClient,
  userId: string
): Promise<EnergyCheckIn | null> {
  try {
    const { data, error } = await supabase
      .from("user_energy_checkins")
      .select("energy_level, note, created_at")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      logApiError("energy-checkins:loadLatestEnergyCheckIn", error);
      return null;
    }
    if (!data) return null;

    return {
      energyLevel: data.energy_level as number,
      note: (data.note as string | null) ?? null,
      createdAt: data.created_at as string,
    };
  } catch (err) {
    logApiError("energy-checkins:loadLatestEnergyCheckIn", err, { userId });
    return null;
  }
}
