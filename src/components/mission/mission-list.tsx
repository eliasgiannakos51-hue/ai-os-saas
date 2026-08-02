import { Rocket } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { EmptyState } from "@/components/empty-state";
import { MissionCard } from "@/components/mission/mission-card";
import type { Mission } from "@/types/mission";

export async function MissionList({ missions }: { missions: Mission[] }) {
  const t = await getTranslations("dashboard.mission");

  if (missions.length === 0) {
    return <EmptyState icon={Rocket}>{t("emptyState")}</EmptyState>;
  }

  return (
    <div className="space-y-4">
      {missions.map((mission) => (
        <MissionCard key={mission.id} mission={mission} />
      ))}
    </div>
  );
}
