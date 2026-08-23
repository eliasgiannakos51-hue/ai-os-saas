import { Smartphone } from "lucide-react";

/**
 * How many people are on iOS, how many installed, how many accepted push.
 *
 * These three numbers exist because "should this be a native app?" kept
 * being answered from impressions. Every figure here is a count first and
 * a percentage second — "80% are on iOS" is a different statement when the
 * denominator is 5 devices, and a panel that showed only the percentage
 * would let that pass unnoticed.
 *
 * WHAT IT DOES NOT MEASURE, said on the page rather than left to be
 * assumed: only SIGNED-IN browsers are counted, because the row is keyed
 * to a user. Visitors who never logged in are invisible here, so this is
 * adoption among customers, not among traffic.
 */

export type PwaAdoptionRow = {
  devices: number;
  iosDevices: number;
  iosPercent: number | null;
  installedDevices: number;
  installedPercent: number | null;
  pushGrantedDevices: number;
  pushGrantedPercent: number | null;
  pushSubscribedDevices: number;
  pushSubscribedPercent: number | null;
  iosInstalledDevices: number;
  iosInstalledPercent: number | null;
};

function Figure({
  label,
  count,
  percent,
  of,
  note,
}: {
  label: string;
  count: number;
  percent: number | null;
  of: number;
  note?: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-black/20 p-3">
      <p className="text-[11px] uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums">
        {/* No denominator means no percentage — printing 0% here would
            read as a measured zero rather than as "nothing to divide by". */}
        {percent === null ? "—" : `${percent}%`}
      </p>
      <p className="text-[11px] text-muted tabular-nums">
        {count} of {of}
      </p>
      {note && <p className="mt-1 text-[11px] text-muted">{note}</p>}
    </div>
  );
}

export function PwaAdoption({ row, days }: { row: PwaAdoptionRow | null; days: number }) {
  return (
    <section className="mt-6 rounded-xl border border-border bg-panel p-5">
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <Smartphone className="h-4 w-4 text-orange-400" aria-hidden="true" />
        PWA adoption — last {days} days
      </h2>

      {row === null ? (
        <p className="mt-3 text-xs text-muted">
          Could not read pwa_adoption_summary(). Apply the migration
          20260823000000_pwa_client_stats.sql, then reload.
        </p>
      ) : row.devices === 0 ? (
        <p className="mt-3 text-xs text-muted">
          No devices have reported yet. A row is written the first time a signed-in browser
          loads the dashboard after this ships — so this stays empty until the next deploy
          reaches real users.
        </p>
      ) : (
        <>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Figure label="On iOS / iPadOS" count={row.iosDevices} percent={row.iosPercent} of={row.devices} />
            <Figure
              label="Installed"
              count={row.installedDevices}
              percent={row.installedPercent}
              of={row.devices}
              note="display-mode is not 'browser'"
            />
            <Figure
              label="Push granted"
              count={row.pushGrantedDevices}
              percent={row.pushGrantedPercent}
              of={row.devices}
            />
            <Figure
              label="Push subscribed"
              count={row.pushSubscribedDevices}
              percent={row.pushSubscribedPercent}
              of={row.devices}
              note="a live subscription exists"
            />
          </div>

          {/* The one cross-tab that decides the question: on iOS, push is
              impossible until the app is on the Home Screen, so the share
              of iOS devices that installed IS the ceiling on iOS
              notifications. */}
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Figure
              label="iOS devices that installed"
              count={row.iosInstalledDevices}
              percent={row.iosInstalledPercent}
              of={row.iosDevices}
              note="iOS grants web push only to an installed app — this is the ceiling on iPhone notifications"
            />
            <div className="rounded-lg border border-border bg-black/20 p-3">
              <p className="text-[11px] uppercase tracking-wide text-muted">Counted</p>
              <p className="mt-1 text-xl font-semibold tabular-nums">{row.devices}</p>
              <p className="text-[11px] text-muted">
                signed-in browsers seen in the window. Signed-out visitors are not counted —
                this is adoption among customers, not among traffic.
              </p>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
