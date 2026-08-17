import { pageTitle } from "@/lib/page-title";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CreateStudio } from "@/components/create/create-studio";

export function generateMetadata(): Promise<Metadata> {
  return pageTitle("common.createStudio");
}

// Create Studio replaces the old free-text "Create Anything" thread here.
// The classifier behind it is the same one — /api/create still routes an
// entry into a module — but it is no longer the ONLY thing this page can
// produce, and the user no longer has to know in advance whether what
// they want is a module entry, a website, a mission, an automation or a
// document. They write one sentence; the studio works out which it is,
// shows them what it understood along with the real cost and time range,
// and only then creates anything.
export default async function CreatePage() {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <main className="min-h-full bg-dot-grid">
      <CreateStudio />
    </main>
  );
}
