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
// A permanent redirect rather than a deleted route: this address has been
// in the sidebar since the page shipped, and somebody has it bookmarked.
import { permanentRedirect } from "next/navigation";

export default function MemoryMoved(): never {
  permanentRedirect("/dashboard/search");
}
