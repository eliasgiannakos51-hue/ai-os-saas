#!/usr/bin/env node
// THE GLOBE'S LAND, computed once and pasted into the mockup as a constant.
//
// Run: node scripts/globe-mask.mjs <path to world-atlas@2.0.2 land-110m.json> [N]
//
// N points are laid on a Fibonacci sphere; each one is kept if it falls on
// land in Natural Earth's 1:110m coastline (world-atlas, ISC). What the page
// carries is N and one bit per point, base64 - a few hundred bytes instead of
// a map library, decoded with the same Fibonacci formula the page uses.
import { readFileSync } from "node:fs";

const [file, nArg] = process.argv.slice(2);
if (!file) { console.error("usage: node scripts/globe-mask.mjs land-110m.json [N]"); process.exit(2); }
const N = Number(nArg || 5600);
const topo = JSON.parse(readFileSync(file, "utf8"));
const [sx, sy] = topo.transform.scale;
const [tx, ty] = topo.transform.translate;
// Delta-decoded, transformed arcs.
const arcs = topo.arcs.map((arc) => {
  let x = 0, y = 0;
  return arc.map(([dx, dy]) => { x += dx; y += dy; return [x * sx + tx, y * sy + ty]; });
});
const ring = (ids) => {
  const out = [];
  for (const id of ids) {
    const a = id < 0 ? [...arcs[~id]].reverse() : arcs[id];
    out.push(...(out.length ? a.slice(1) : a));
  }
  return out;
};
const polys = [];
for (const g of topo.objects.land.geometries) {
  const list = g.type === "Polygon" ? [g.arcs] : g.arcs;
  for (const p of list) polys.push(p.map(ring));
}
const inRing = (lon, lat, r) => {
  let inside = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, yi] = r[i], [xj, yj] = r[j];
    if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};
const onLand = (lon, lat) => polys.some((p) => inRing(lon, lat, p[0]) && !p.slice(1).some((h) => inRing(lon, lat, h)));

const GOLDEN = Math.PI * (3 - Math.sqrt(5));
const bits = new Uint8Array(Math.ceil(N / 8));
let land = 0;
for (let i = 0; i < N; i++) {
  const y = 1 - (2 * (i + 0.5)) / N;
  const r = Math.sqrt(1 - y * y);
  const t = i * GOLDEN;
  const lat = (Math.asin(y) * 180) / Math.PI;
  const lon = (Math.atan2(Math.sin(t) * r, Math.cos(t) * r) * 180) / Math.PI;
  if (onLand(lon, lat)) { bits[i >> 3] |= 1 << (i & 7); land++; }
}
console.log(JSON.stringify({ n: N, land, mask: Buffer.from(bits).toString("base64") }));
