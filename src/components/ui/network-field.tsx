"use client";

import { useEffect, useRef, useState } from "react";

// The "AI universe" layer that sits over the wireframe globe: a slow
// constellation of nodes joined by light lines, drifting as a whole and
// shifting slightly against the pointer so the backdrop has depth rather
// than being a flat printed texture.
//
// Deliberately SVG + CSS transforms, not canvas and not a particle
// library: at this node count the whole thing is a handful of <line>/
// <circle> elements the compositor can transform on the GPU, and it
// costs nothing next to shipping a physics engine for a decoration.
//
// Node positions are computed ONCE from a fixed seed, not from
// Math.random() at render time — random values differ between the server
// render and the first client render, which React reports as a hydration
// mismatch.

const NODE_COUNT = 26;
const VIEW = 1000;
// Two nodes are joined only if they're closer than this in viewBox units.
// Tuned so the field reads as a connected constellation rather than
// either a scatter of dots or a solid mesh.
const LINK_DISTANCE = 235;

// Deterministic PRNG (mulberry32) — same sequence every run, on both
// server and client.
function seeded(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const NODES = (() => {
  const rand = seeded(20260804);
  return Array.from({ length: NODE_COUNT }, (_, i) => ({
    x: rand() * VIEW,
    y: rand() * VIEW,
    r: 1.6 + rand() * 2.6,
    // Depth: nearer nodes (higher depth) move further with the pointer,
    // which is what actually produces the parallax.
    depth: 0.35 + rand() * 0.65,
    delay: `${(i * 0.37).toFixed(2)}s`,
    dur: `${(3.2 + rand() * 3).toFixed(2)}s`,
  }));
})();

const LINKS = (() => {
  const out: { x1: number; y1: number; x2: number; y2: number; opacity: number }[] = [];
  for (let i = 0; i < NODES.length; i++) {
    for (let j = i + 1; j < NODES.length; j++) {
      const dx = NODES[i].x - NODES[j].x;
      const dy = NODES[i].y - NODES[j].y;
      const d = Math.hypot(dx, dy);
      if (d < LINK_DISTANCE) {
        // Closer pairs get a brighter line, so the constellation has
        // structure instead of a uniform web.
        out.push({ x1: NODES[i].x, y1: NODES[i].y, x2: NODES[j].x, y2: NODES[j].y, opacity: 1 - d / LINK_DISTANCE });
      }
    }
  }
  return out;
})();

export function NetworkField({ opacity = 0.5 }: { opacity?: number }) {
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const frameRef = useRef<number | null>(null);
  const targetRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    // Parallax is a decorative motion effect — skip it entirely for
    // reduced-motion users rather than leaving a pointer listener running
    // that produces movement the CSS kill-switch can't reach (it only
    // zeroes animation/transition duration, not a JS-set transform).
    const reduced =
      document.documentElement.dataset.motion === "reduce" ||
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduced) return;

    // Fine pointers only. On touch there is no hover position to follow,
    // and wiring this to touchmove would fight scrolling.
    if (!window.matchMedia?.("(pointer: fine)").matches) return;

    function onMove(e: MouseEvent) {
      // -1..1 from the viewport centre, scaled to a few px of travel.
      targetRef.current = {
        x: (e.clientX / window.innerWidth - 0.5) * 2,
        y: (e.clientY / window.innerHeight - 0.5) * 2,
      };
      if (frameRef.current !== null) return;
      // One rAF per frame at most: mousemove can fire far more often
      // than the display refreshes, and every extra setState would be a
      // render the browser throws away.
      frameRef.current = requestAnimationFrame(() => {
        frameRef.current = null;
        setOffset(targetRef.current);
      });
    }

    window.addEventListener("mousemove", onMove, { passive: true });
    return () => {
      window.removeEventListener("mousemove", onMove);
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    };
  }, []);

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-0 overflow-hidden"
      style={{ opacity }}
    >
      <svg
        viewBox={`0 0 ${VIEW} ${VIEW}`}
        preserveAspectRatio="xMidYMid slice"
        className="h-full w-full"
        // The whole field drifts as one; individual nodes then add their
        // own depth on top. transform is compositor-friendly, so this
        // never triggers layout.
        style={{
          transform: `translate3d(${offset.x * -14}px, ${offset.y * -14}px, 0)`,
          transition: "transform 700ms cubic-bezier(0.22, 1, 0.36, 1)",
        }}
      >
        <defs>
          <linearGradient id="netLine" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#f97316" />
            <stop offset="100%" stopColor="#a855f7" />
          </linearGradient>
          <filter id="netGlow" x="-100%" y="-100%" width="300%" height="300%">
            <feGaussianBlur stdDeviation="3" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {LINKS.map((l, i) => (
          <line
            key={i}
            x1={l.x1}
            y1={l.y1}
            x2={l.x2}
            y2={l.y2}
            stroke="url(#netLine)"
            strokeWidth={0.9}
            opacity={l.opacity * 0.55}
          />
        ))}

        {NODES.map((n, i) => (
          <circle
            key={i}
            cx={n.x}
            cy={n.y}
            r={n.r}
            fill={i % 4 === 0 ? "#a855f7" : "#f97316"}
            filter="url(#netGlow)"
            className="animate-pulse"
            style={{
              animationDelay: n.delay,
              animationDuration: n.dur,
              transform: `translate3d(${offset.x * n.depth * -26}px, ${offset.y * n.depth * -26}px, 0)`,
              transition: "transform 900ms cubic-bezier(0.22, 1, 0.36, 1)",
            }}
          />
        ))}
      </svg>
    </div>
  );
}
