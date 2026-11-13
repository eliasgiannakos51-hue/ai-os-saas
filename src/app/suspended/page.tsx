import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import { SuspendedNotice } from "@/components/suspended-notice";
import { isSuspended, suspensionReason } from "@/lib/auth/suspension";

export default async function SuspendedPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  if (!isSuspended(user)) {
    redirect("/dashboard");
  }

  const reason = suspensionReason(user);

  return <SuspendedNotice reason={reason} />;
}
