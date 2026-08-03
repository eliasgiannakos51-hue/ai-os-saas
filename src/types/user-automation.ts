import type { AutomationFrequency } from "@/lib/automation-schedule";

export type UserAutomation = {
  id: string;
  user_id: string;
  description: string;
  frequency: AutomationFrequency;
  day_of_week: number | null;
  day_of_month: number | null;
  is_active: boolean;
  last_run_at: string | null;
  next_run_at: string;
  created_at: string;
};
