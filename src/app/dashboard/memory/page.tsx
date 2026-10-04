// THE OLD ADDRESS OF THE RECORD SEARCH, KEPT SO NOBODY GETS A 404.
//
// Two different things were called "Memory". This route was the one that
// searches YOUR OWN RECORDS across every module; /dashboard/ai-memory is
// the new one that shows what the chat has remembered ABOUT you. The help
// article pointed at this URL while describing the other, and the sidebar
// entry for this page was described as "What the AI remembers about you"
// in all ten languages — so the name had to move, and the name moving
// means the URL moves with it.
//
// middleware.ts answers this address first (lib/nav/early-redirects.ts,
// issue #61); this page is the fallback.
//
// A permanent redirect rather than a deleted route: this address has been
// in the sidebar since the page shipped, and somebody has it bookmarked.
import { permanentRedirect } from "next/navigation";
import { PERMANENT_MOVES } from "@/lib/nav/early-redirects";

export default function MemoryMoved(): never {
  permanentRedirect(PERMANENT_MOVES["/dashboard/memory"]);
}
