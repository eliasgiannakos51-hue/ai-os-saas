import { AuthBackground } from "@/components/auth/auth-background";
import { NetworkField } from "@/components/ui/network-field";

// The full backdrop stack, in one place: wireframe globe, constellation
// network on top of it, ambient corner pools over both. Used by every
// public page (landing, login, signup, pricing, legal) so they
// share the exact same backdrop as the dashboard, which composes the
// same three layers itself in dashboard-background.tsx (that one needs
// to be a Client Component to read the pathname; this one doesn't).
const NETWORK_RATIO = 0.62;

export function AppBackground({ opacity = 0.38 }: { opacity?: number }) {
  return (
    <>
      <AuthBackground opacity={opacity} />
      <NetworkField opacity={opacity * NETWORK_RATIO} />
      <div aria-hidden="true" className="ambient-corners" />
    </>
  );
}
