import { LogoutButton } from "@/components/logout-button";
import { MenuButton } from "@/components/dashboard/menu-button";

export function DashboardHeader({ email }: { email: string }) {
  return (
    <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-4 sm:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <MenuButton />
        <div className="min-w-0">
          <p className="text-xs tracking-widest text-amber-500">AI_OS //</p>
          <h1 className="text-lg font-bold text-foreground">dashboard</h1>
        </div>
      </div>
      <div className="flex items-center gap-4">
        <span className="hidden text-xs text-muted sm:inline">{email}</span>
        <LogoutButton />
      </div>
    </header>
  );
}
