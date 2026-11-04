import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import { SuspendedNotice } from "@/components/suspended-notice";

export default async function SuspendedPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  if (user.user_metadata?.suspended !== true) {
    redirect("/dashboard");
  }

  const reason = (user.user_metadata?.suspended_reason as string) ?? "";

  return <SuspendedNotice reason={reason} />;
}
