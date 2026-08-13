// Boots a throwaway PostgreSQL cluster for the integration tests that need
// a real database rather than a simulation of one.
//
// Why this exists: the concurrency defects this repo keeps finding (lost
// credit grants, an undercounting spend breaker) are *database* races. They
// cannot be reproduced by a JavaScript mock — a mock has one thread and
// whatever interleaving the test author imagined. The only honest test is N
// real connections hitting one real server, which is what this gives.
//
// Resolution order:
//   1. TEST_DATABASE_URL / DATABASE_URL, if set — use that server as-is.
//   2. A local initdb/pg_ctl, if present — boot a private cluster in a temp
//      directory on a high port, and tear it down afterwards.
//   3. Otherwise: unavailable, and the caller SKIPs rather than pretending.
//
// Nothing here is imported by the application. It exists only under scripts/.
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, existsSync, readdirSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

/** Newest-first list of candidate directories holding initdb/pg_ctl/psql. */
function candidateBinDirs() {
  const dirs = [];
  const versioned = "/usr/lib/postgresql";
  if (existsSync(versioned)) {
    for (const v of readdirSync(versioned).sort((a, b) => Number(b) - Number(a))) {
      dirs.push(path.join(versioned, v, "bin"));
    }
  }
  // Homebrew and plain-PATH installs.
  dirs.push("/opt/homebrew/opt/postgresql@16/bin", "/usr/local/bin", "/usr/bin");
  return dirs.filter((d) => existsSync(path.join(d, "initdb")));
}

function which(cmd) {
  const r = spawnSync("sh", ["-c", `command -v ${cmd}`], { encoding: "utf8" });
  return r.status === 0 ? r.stdout.trim() : null;
}

/**
 * @returns {{available: false, reason: string} |
 *           {available: true, conn: {host?: string, port?: number, user: string,
 *            database: string, url: string|null}, psql: string, stop: () => void}}
 */
export function startEphemeralPostgres() {
  const url = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
  if (url) {
    const psql = which("psql");
    if (!psql) return { available: false, reason: "TEST_DATABASE_URL is set but psql is not on PATH." };
    return { available: true, conn: { url, user: "", database: "" }, psql, stop() {} };
  }

  const binDirs = candidateBinDirs();
  if (binDirs.length === 0) {
    return {
      available: false,
      reason: "No local PostgreSQL found (no initdb) and no TEST_DATABASE_URL set.",
    };
  }
  const bin = binDirs[0];
  const initdb = path.join(bin, "initdb");
  const pgCtl = path.join(bin, "pg_ctl");
  const psql = path.join(bin, "psql");

  // initdb refuses to run as root. In a container that runs as root (CI,
  // this repo's dev sandbox) fall back to the `postgres` service account,
  // which the distribution package creates.
  const isRoot = typeof process.getuid === "function" && process.getuid() === 0;
  let runAs = null;
  if (isRoot) {
    const probe = spawnSync("id", ["-u", "postgres"], { encoding: "utf8" });
    if (probe.status !== 0) {
      return { available: false, reason: "Running as root and no `postgres` user exists to drop privileges to." };
    }
    runAs = "postgres";
  }

  const dir = mkdtempSync(path.join(tmpdir(), "ionexa-pg-"));
  const dataDir = path.join(dir, "data");
  // The socket lives outside the data dir so its path stays short — Unix
  // sockets have a ~100 char limit and mkdtemp paths are already long.
  const sockDir = mkdtempSync(path.join(tmpdir(), "ionexa-sock-"));
  const port = 45000 + Math.floor(process.pid % 2000);

  const sh = (cmd) => {
    const full = runAs ? ["su", runAs, "-c", cmd] : ["sh", "-c", cmd];
    return execFileSync(full[0], full.slice(1), { encoding: "utf8", stdio: "pipe" });
  };

  try {
    execFileSync("mkdir", ["-p", dataDir]);
    if (runAs) {
      execFileSync("chown", ["-R", `${runAs}:${runAs}`, dataDir, sockDir]);
      chmodSync(dir, 0o755);
      chmodSync(dataDir, 0o700);
    }
    sh(`${initdb} -D ${dataDir} -A trust -U postgres --encoding=UTF8 --locale=C.UTF-8`);
    sh(`${pgCtl} -D ${dataDir} -l ${dataDir}/server.log -o "-p ${port} -k ${sockDir} -c listen_addresses=''" -w start`);
  } catch (err) {
    try { rmSync(dir, { recursive: true, force: true }); } catch {}
    try { rmSync(sockDir, { recursive: true, force: true }); } catch {}
    return { available: false, reason: `Could not start a local cluster: ${String(err.message || err).slice(0, 300)}` };
  }

  let stopped = false;
  return {
    available: true,
    psql,
    conn: { host: sockDir, port, user: "postgres", database: "postgres", url: null },
    stop() {
      if (stopped) return;
      stopped = true;
      try { sh(`${pgCtl} -D ${dataDir} -m immediate -w stop`); } catch {}
      try { rmSync(dir, { recursive: true, force: true }); } catch {}
      try { rmSync(sockDir, { recursive: true, force: true }); } catch {}
    },
  };
}

/** psql argv prefix for a connection descriptor from startEphemeralPostgres. */
export function psqlArgs(conn) {
  if (conn.url) return [conn.url];
  return ["-h", conn.host, "-p", String(conn.port), "-U", conn.user, "-d", conn.database];
}
