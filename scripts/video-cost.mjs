// What a generated video would cost, in credits, on every plan - and what it
// weighs in storage. Analysis only: no video provider is wired in src/.
//
// Two kinds of number, kept apart:
//   FROM THE REPO, read at run time: the plans and their credits
//     (src/lib/billing/plans.ts), the USD->EUR rate
//     (src/lib/billing/pricing-config.ts), the storage each plan gets
//     (src/lib/files/limits.ts).
//   LOOKED UP 2026-10-02, written below with their sources: provider rates.
//     These move; the date is the claim. The official Runway pricing page
//     (docs.dev.runwayml.com) is blocked by this environment's network
//     policy, so Runway's figures come from secondary sources.
//
// Margin: 5x on paid plans and 6x on Free is what the code applies, measured
// by scripts/measure-margin.mjs on 2026-10-02. The 4x the owner names is
// printed beside it, because it is a reduction of 20%, not a tightening.
//
// Run: node scripts/video-cost.mjs
import { loadTs, loadTsWithDeps } from "./tests/load-ts.mjs";

const { PLANS } = await loadTsWithDeps("src/lib/billing/plans.ts");
const cfgSrc = (await import("node:fs")).readFileSync("src/lib/billing/pricing-config.ts", "utf8");
const USD_EUR = Number((cfgSrc.match(/usdToEurRate:\s*([0-9.]+)/) || [])[1]);
if (!USD_EUR) throw new Error("could not read usdToEurRate from pricing-config.ts");
const limitsSrc = (await import("node:fs")).readFileSync("src/lib/files/limits.ts", "utf8");

// provider, model, resolution, USD per second, max seconds per call, source
const RATES = [
  ["Kling", "2.5 Turbo", "720p", 0.042, 10, "kling.ai/document-api/pricing/base/video"],
  ["Kling", "2.5 Turbo", "1080p", 0.07, 10, "kling.ai/document-api/pricing/base/video"],
  ["Kling", "3.0 native 4K", "2160p", 0.42, 10, "kling.ai/blog/kling-video-3-0-credit-cost-guide"],
  ["Runway", "Gen-4 Turbo", "720p", 0.05, 10, "apiframe.ai/guides/runway-api-guide"],
  ["Runway", "Gen-4.5", "720p-1080p*", 0.12, 10, "apiframe.ai/guides/runway-api-guide"],
  ["Runway", "Gen-4 Turbo + upscale_v1", "2160p", 0.05 + 0.02, 10, "upscale_v1 at 2 credits/s, wavespeed.ai/docs"],
  ["Luma", "Ray3", "1080p", 0.24, 10, "apiframe.ai/guides/luma-api-guide"],
];
const MARGIN = { free: 6, starter: 5, growth: 5, professional: 5, ultimate: 5 };
const plans = PLANS.filter((p) => typeof p.price === "number" && typeof p.monthlyCredits === "number");
// What a credit is worth on each plan; Free's credits are worth the list price.
const eurPerCredit = (p) => (p.price > 0 ? p.price / p.monthlyCredits : 0.02);
const credits = (usd, p, m) => Math.ceil((usd * USD_EUR * m) / eurPerCredit(p));
const pad = (s, n) => String(s).padEnd(n);
const lpad = (s, n) => String(s).padStart(n);

for (const seconds of [10, 30]) {
  console.log("\n=== " + seconds + " seconds" + (seconds > 10 ? "  (" + Math.ceil(seconds / 10) + " clips stitched: no provider makes " + seconds + "s in one call)" : "") + " ===");
  console.log(pad("", 40) + plans.map((p) => lpad(p.slug, 13)).join(""));
  for (const [prov, model, res, usd] of RATES) {
    const cost = usd * seconds;
    const row = plans.map((p) => {
      const c = credits(cost, p, MARGIN[p.slug]);
      return lpad((c > p.monthlyCredits ? "✗ " : "") + c.toLocaleString("en"), 13);
    }).join("");
    console.log(pad(prov + " " + model + " " + res, 30) + lpad("$" + cost.toFixed(2), 10) + row);
  }
}
console.log("\n✗ = more than the plan's whole month (" + plans.map((p) => p.slug + " " + p.monthlyCredits.toLocaleString("en")).join(", ") + ")");
console.log("credits at the 4x the owner names = these x 0.8 on paid plans");
console.log("* sources disagree on whether Gen-4.5 renders 720p or 1080p natively");

// ------------------------------------------------------------- storage
// The size we KEEP is set by the bitrate we store at, not by the provider.
// MB = Mbps x seconds / 8. These are encoder settings to choose between,
// not measurements of any provider's file.
console.log("\n=== storage: MB per clip at the bitrate we choose to keep ===");
const RATES_MBPS = [["720p", 5], ["1080p", 8], ["2160p, efficient (HEVC)", 20], ["2160p, high (H.264)", 45]];
console.log(pad("", 28) + [5, 10, 30].map((s) => lpad(s + "s", 9)).join(""));
for (const [label, mbps] of RATES_MBPS) {
  console.log(pad(label + " @ " + mbps + " Mbps", 28) + [5, 10, 30].map((s) => lpad((mbps * s / 8).toFixed(1) + " MB", 9)).join(""));
}
console.log("\n=== how many 10s 4K clips (at 20 Mbps, 25 MB) each plan's file storage holds ===");
for (const p of plans) {
  const m = limitsSrc.match(new RegExp("\\b" + p.slug + ":\\s*([0-9]+)\\s*\\*\\s*(MB|GB)"));
  if (!m) continue;
  const mb = Number(m[1]) * (m[2] === "GB" ? 1024 : 1);
  console.log("  " + pad(p.slug, 14) + lpad(mb >= 1024 ? mb / 1024 + " GB" : mb + " MB", 8) + "  ->  " + lpad(Math.floor(mb / 25), 5) + " clips");
}
// Supabase Pro, LOOKED UP 2026-10-02: 100 GB included, then $0.021/GB-month;
// 250 GB egress included, then $0.09/GB.
const gbMonth = 0.021, egress = 0.09, clipGb = 25 / 1024;
console.log("\n  keeping one 25 MB clip for a month beyond the included 100 GB: $" + (clipGb * gbMonth).toFixed(5));
console.log("  serving it once beyond the included 250 GB egress:             $" + (clipGb * egress).toFixed(4));
console.log("  (Supabase Pro, 2026-10-02; storage is not where video costs money - generation is)");
