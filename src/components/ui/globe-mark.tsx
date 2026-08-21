import { globeShapes, orbitingRoles, nodeScaleFor, GLOBE_VIEW, type GlobeDetail } from "@/lib/brand/globe";

/**
 * The globe, as a component.
 *
 * Every shape comes from lib/brand/globe.ts — the same data the favicon,
 * the apple icon and the email logo are generated from — so there is no
 * second copy of the drawing anywhere to drift out of step. See that
 * file's header for why the mark is the sphere/orbit/node and not the
 * backdrop's eleven-band wireframe.
 *
 * SPIN IS A GROUP TRANSFORM ON A SMALL SVG, and that is a deliberate
 * distinction from the two performance disasters this codebase already
 * fixed. NetworkField and AuthBackground animated content INSIDE a
 * full-viewport filtered SVG, so the browser re-rasterised a 140vmin
 * graphic on the main thread every frame and keystroke latency measured
 * 120ms. Here the SVG is 16-48px, carries no filter, and only the orbit
 * and its node rotate — the sphere and its bands are rotationally
 * symmetric, so spinning them would cost repaints and look identical.
 * scripts/tests/globe-mark.prodtest.mjs measures the frame rate rather
 * than trusting this paragraph.
 *
 * Motion collapses under reduced motion through globals.css's two
 * kill-switches (html[data-motion="reduce"] and the
 * prefers-reduced-motion media query), plus an explicit rule for this
 * class so the orbit rests at its drawn angle instead of mid-sweep.
 */
export function GlobeMark({
  size = 20,
  detail,
  spin = false,
  className = "",
  title,
}: {
  /** Rendered px. `detail` defaults from this: interior bands are noise
   *  below 28px, which is measured in globe-mark.prodtest.mjs, not
   *  guessed. */
  size?: number;
  detail?: GlobeDetail;
  /** Rotate the orbit. On for "working"; off for a static mark. */
  spin?: boolean;
  className?: string;
  /** Screen-reader text. Omitted means aria-hidden — callers that already
   *  announce their state in a live region must not announce it twice. */
  title?: string;
}) {
  const resolved: GlobeDetail = detail ?? (size >= 28 ? "full" : "mark");
  // OPTICAL COMPENSATION, and the reason it is here is that the generators
  // had it and this did not. See nodeScaleFor's own comment: at 18px the
  // node was measured painting 1.75px across, which is antialiasing, not
  // a bead. Above 48px this is 1 and the drawing is untouched.
  const nodeScale = nodeScaleFor(size);
  const orbiting = new Set<string>(orbitingRoles());
  const shapes = globeShapes(resolved);
  const still = shapes.filter((s) => !orbiting.has(s.role));
  const moving = shapes.filter((s) => orbiting.has(s.role));

  const render = (shape: (typeof shapes)[number], index: number) => {
    const common = { className: `globe-${shape.role}`, opacity: shape.opacity };
    if (shape.kind === "circle") {
      return shape.stroke === null ? (
        <circle key={index} {...common} cx={shape.cx} cy={shape.cy} r={shape.role === "node" ? shape.r * nodeScale : shape.r} fill="currentColor" />
      ) : (
        <circle
          key={index}
          {...common}
          cx={shape.cx}
          cy={shape.cy}
          r={shape.r}
          fill="none"
          stroke="currentColor"
          strokeWidth={shape.stroke * BASE_STROKE}
        />
      );
    }
    return (
      <ellipse
        key={index}
        {...common}
        cx={shape.cx}
        cy={shape.cy}
        rx={shape.rx}
        ry={shape.ry}
        fill="none"
        stroke="currentColor"
        strokeWidth={shape.stroke * BASE_STROKE}
        transform={shape.rotate ? `rotate(${shape.rotate} ${shape.cx} ${shape.cy})` : undefined}
      />
    );
  };

  return (
    <span
      className={`ionexa-globe ${spin ? "is-spinning" : ""} ${className}`}
      role={title ? "status" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      data-testid="globe-mark"
      data-detail={resolved}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${GLOBE_VIEW} ${GLOBE_VIEW}`}
        focusable="false"
        // vector-effect keeps the hairlines a real pixel wide at 16px
        // instead of scaling to a fraction of one and disappearing.
        vectorEffect="non-scaling-stroke"
      >
        {still.map(render)}
        <g className="globe-orbit-group">{moving.map(render)}</g>
      </svg>
    </span>
  );
}

/** Stroke width, in viewBox units, for a `stroke: 1` shape. 3.2 of a 100
 *  unit box is 0.5px at 16px and 1.5px at 48px — thin enough not to fill
 *  the sphere at small sizes, thick enough to survive the downscale. */
const BASE_STROKE = 3.2;
