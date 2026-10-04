/**
 * THE EARTH — the one 3D mark of the design (docs/CONTEXT.md, ΣΥΣΤΗΜΑ
 * DESIGN — ΤΟ ΤΕΛΙΚΟ, «Η ΓΗ»).
 *
 * "Σφαίρα από λεπτές γραμμές: μεγάλοι κύκλοι σε διαφορετικές κλίσεις, μία
 * εξωτερική τροχιά και ένας δορυφόρος που κινείται πάνω της. Αργή, συνεχής
 * περιστροφή." Three sizes, each with the detail the design names:
 *
 *   logo   static, in the sidebar's wordmark
 *   small  ~64px beside the greeting and beside every answer: about six
 *          great circles and no nodes, so it stays clean
 *   large  ~160px above the sign-in form: nine great circles and small
 *          nodes on the surface
 *
 * PURE GEOMETRY, no DOM and no clock. The same function draws the static
 * frame the server renders (components/brand/earth.tsx, the "στατική
 * εικόνα όταν δεν υπάρχει 3D") and every frame of the canvas animation,
 * so the two cannot disagree, and scripts/tests/earth.test.mjs can run it.
 *
 * A real projection, not a drawing of one: each great circle is a circle
 * on the unit sphere, rotated and projected orthographically. The half
 * that faces the viewer is drawn at the design's ~40%, the far half
 * fainter, which is what makes it read as a sphere rather than a tangle.
 */

export type EarthVariant = "logo" | "small" | "large";

type Spec = { circles: number; nodes: number; lineWidth: number; satelliteR: number };

/** What each size draws. The circle counts are the design's. */
export const EARTH_SPEC: Record<EarthVariant, Spec> = {
  logo: { circles: 4, nodes: 0, lineWidth: 2.4, satelliteR: 4.4 },
  small: { circles: 6, nodes: 0, lineWidth: 1.4, satelliteR: 3.2 },
  large: { circles: 9, nodes: 14, lineWidth: 0.9, satelliteR: 2.6 },
};

/** The design's opacities: lines ~40%, the orbit ~80%. */
export const LINE_OPACITY = 0.4;
export const BACK_OPACITY = 0.12;
export const ORBIT_OPACITY = 0.8;

/** viewBox is 0 0 100 100; the sphere's radius and the orbit's. */
export const VIEW = 100;
const C = VIEW / 2;
const R = 33;
const ORBIT_R = 46;
/** The axial tilt the whole sphere is seen at. */
const TILT = 0.38;
/** The orbit's own tilt, out of the screen plane. */
const ORBIT_TILT = 1.18;
const SAMPLES = 72;

/** Rotation speeds, radians per second. Slow at rest; quicker while the
 *  product works (components/brand/earth.tsx eases between them). */
export const SPIN = { rest: 0.22, working: 1.5 };
export const ORBIT_SPEED = { rest: 0.55, working: 2.2 };

type V3 = [number, number, number];

function normalise(v: V3): V3 {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}
function cross(a: V3, b: V3): V3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

/** The great circles' normals: spread round the pole, at alternating
 *  tilts, so no two circles coincide at any rotation. */
export function greatCircleNormals(count: number): V3[] {
  const out: V3[] = [];
  for (let i = 0; i < count; i++) {
    const azimuth = (i * Math.PI) / count;
    const tilt = i === 0 ? 0 : 0.42 + ((i % 3) * 0.43);
    out.push(normalise([Math.sin(tilt) * Math.cos(azimuth), Math.cos(tilt), Math.sin(tilt) * Math.sin(azimuth)]));
  }
  return out;
}

/** Fixed points on the surface for the large size, spread by a golden
 *  spiral so they never clump. */
export function surfaceNodes(count: number): V3[] {
  const out: V3[] = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < count; i++) {
    const y = 1 - (i + 0.5) * (2 / count);
    const r = Math.sqrt(1 - y * y);
    out.push([Math.cos(golden * i) * r, y, Math.sin(golden * i) * r]);
  }
  return out;
}

/** Spin about the vertical axis, then the fixed axial tilt. */
function view(p: V3, spin: number): V3 {
  const cs = Math.cos(spin);
  const sn = Math.sin(spin);
  const x = p[0] * cs + p[2] * sn;
  const z = -p[0] * sn + p[2] * cs;
  const ct = Math.cos(TILT);
  const st = Math.sin(TILT);
  return [x, p[1] * ct - z * st, p[1] * st + z * ct];
}

export type EarthStroke = { points: [number, number][]; opacity: number; width: number };
export type EarthDot = { x: number; y: number; r: number; opacity: number };
export type EarthFrame = { strokes: EarthStroke[]; nodes: EarthDot[]; satellite: EarthDot; outline: { r: number; opacity: number } };

/**
 * One frame. `spin` turns the sphere, `orbit` moves the satellite; both
 * in radians. Co-ordinates are in the 100-unit viewBox.
 */
export function earthFrame(variant: EarthVariant, spin: number, orbit: number): EarthFrame {
  const spec = EARTH_SPEC[variant];
  const strokes: EarthStroke[] = [];

  for (const n of greatCircleNormals(spec.circles)) {
    const helper: V3 = Math.abs(n[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    const u = normalise(cross(n, helper));
    const v = cross(n, u);
    let run: [number, number][] = [];
    let runFront: boolean | null = null;
    const flush = () => {
      if (run.length > 1 && runFront !== null) {
        strokes.push({ points: run, opacity: runFront ? LINE_OPACITY : BACK_OPACITY, width: spec.lineWidth });
      }
    };
    for (let i = 0; i <= SAMPLES; i++) {
      const a = (i / SAMPLES) * Math.PI * 2;
      const p = view([u[0] * Math.cos(a) + v[0] * Math.sin(a), u[1] * Math.cos(a) + v[1] * Math.sin(a), u[2] * Math.cos(a) + v[2] * Math.sin(a)], spin);
      const front = p[2] >= 0;
      const xy: [number, number] = [C + p[0] * R, C - p[1] * R];
      if (runFront === null) runFront = front;
      if (front !== runFront) {
        run.push(xy);
        flush();
        run = [xy];
        runFront = front;
      } else {
        run.push(xy);
      }
    }
    flush();
  }

  const nodes: EarthDot[] = [];
  for (const s of surfaceNodes(spec.nodes)) {
    const p = view(s, spin);
    if (p[2] > 0.05) nodes.push({ x: C + p[0] * R, y: C - p[1] * R, r: 1.1, opacity: 0.55 + 0.35 * p[2] });
  }

  // The orbit is fixed in space; only the satellite travels on it. A
  // circle of radius ORBIT_R, tipped out of the screen plane, which
  // projects to an ellipse; the half behind the sphere is drawn faint.
  const orbitPoints: { xy: [number, number]; behind: boolean }[] = [];
  for (let i = 0; i <= SAMPLES; i++) {
    const a = (i / SAMPLES) * Math.PI * 2;
    orbitPoints.push(orbitPoint(a));
  }
  let run: [number, number][] = [];
  let behind: boolean | null = null;
  for (const p of orbitPoints) {
    if (behind === null) behind = p.behind;
    if (p.behind !== behind) {
      run.push(p.xy);
      strokes.push({ points: run, opacity: behind ? BACK_OPACITY : ORBIT_OPACITY, width: spec.lineWidth });
      run = [p.xy];
      behind = p.behind;
    } else run.push(p.xy);
  }
  if (run.length > 1) strokes.push({ points: run, opacity: behind ? BACK_OPACITY : ORBIT_OPACITY, width: spec.lineWidth });

  const sat = orbitPoint(orbit);
  return {
    strokes,
    nodes,
    satellite: { x: sat.xy[0], y: sat.xy[1], r: spec.satelliteR, opacity: sat.behind ? 0.25 : 1 },
    outline: { r: R, opacity: LINE_OPACITY },
  };
}

function orbitPoint(a: number): { xy: [number, number]; behind: boolean } {
  const x = Math.cos(a) * ORBIT_R;
  const y = Math.sin(a) * ORBIT_R * Math.cos(ORBIT_TILT);
  const z = Math.sin(a) * ORBIT_R * Math.sin(ORBIT_TILT);
  // Rotate the whole orbit a little so it crosses the sphere diagonally.
  const k = -0.42;
  const rx = x * Math.cos(k) - y * Math.sin(k);
  const ry = x * Math.sin(k) + y * Math.cos(k);
  const insideDisc = Math.hypot(rx, ry) < R;
  return { xy: [C + rx, C - ry], behind: z < 0 && insideDisc };
}

/** An SVG path for a stroke, for the static frame. */
export function strokePath(points: [number, number][]): string {
  return points.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(2)} ${y.toFixed(2)}`).join("");
}

/** Speed for the moment, easing from one target to the other over about
 *  half a second, so "quicker while it works, calmer when it is done" is a
 *  glide rather than a jump. */
export function easeSpeed(current: number, target: number, dtSeconds: number): number {
  const k = 1 - Math.exp(-dtSeconds / 0.45);
  return current + (target - current) * k;
}
