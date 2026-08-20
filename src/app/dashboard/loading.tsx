import { RouteSkeleton } from "@/components/dashboard/route-skeleton";

// The Suspense fallback for every dashboard route that does not declare
// its own. It is a page-SHAPED skeleton rather than the centred
// LoadingState the whole app boots with — see route-skeleton.tsx for why
// the difference matters between two pages that share their chrome.
export default function Loading() {
  return <RouteSkeleton />;
}
