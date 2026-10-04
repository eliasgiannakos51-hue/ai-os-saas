"use client";

import { useEffect, useRef, useState } from "react";
import {
  ORBIT_SPEED,
  SPIN,
  VIEW,
  earthFrame,
  easeSpeed,
  strokePath,
  type EarthFrame,
  type EarthVariant,
} from "@/lib/brand/earth";

/**
 * THE EARTH — ΣΥΣΤΗΜΑ DESIGN, «Η ΓΗ» (docs/CONTEXT.md, 2026-10-04).
 *
 * One component, three sizes (lib/brand/earth.ts says what each draws):
 *   <Earth variant="logo" />           static, in the wordmark
 *   <Earth variant="small" px={64} />  beside the greeting and every answer
 *   <Earth variant="large" px={160} /> above the sign-in form
 *
 * HOW IT STAYS OUT OF THE PAGE'S WAY ("δεν καθυστερεί το φόρτωμα· το 3D
 * φορτώνει μετά το κείμενο"):
 *   1. The server renders a STATIC frame as SVG. It is part of the HTML,
 *      costs no script, and is what shows with no JavaScript, with no
 *      canvas ("στατική εικόνα όταν δεν υπάρχει 3D") and with reduced
 *      motion ("ακίνητη με «μειωμένη κίνηση»").
 *   2. Only when the browser is idle after the page has painted does a
 *      canvas take over and turn it, drawn from the same geometry.
 *   3. It stops drawing whenever it is off screen or the tab is hidden.
 *
 * `working` makes it turn quicker while the product works, and it eases
 * back to the slow turn when that ends.
 *
 * The colour is the signal's, taken from the stylesheet (.ionexa-earth in
 * globals.css): the globe and the logo are the only places it may appear.
 */
export function Earth({
  variant,
  px,
  working = false,
  label,
  className = "",
}: {
  variant: EarthVariant;
  /** Rendered size in CSS pixels. */
  px?: number;
  working?: boolean;
  /** Accessible name; omit for a decorative instance (aria-hidden). */
  label?: string;
  className?: string;
}) {
  const size = px ?? (variant === "logo" ? 24 : variant === "small" ? 64 : 160);
  const host = useRef<HTMLSpanElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const workingRef = useRef(working);
  workingRef.current = working;
  const [live, setLive] = useState(false);

  useEffect(() => {
    if (variant === "logo") return;
    const el = host.current;
    const cv = canvas.current;
    if (!el || !cv) return;
    const reduce =
      document.documentElement.dataset.motion === "reduce" ||
      (document.documentElement.dataset.motion !== "full" &&
        typeof window.matchMedia === "function" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    if (reduce) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let visible = true;
    let last = 0;
    let spin = 0.6;
    let orbit = 0.9;
    let spinSpeed = workingRef.current ? SPIN.working : SPIN.rest;
    let orbitSpeed = workingRef.current ? ORBIT_SPEED.working : ORBIT_SPEED.rest;
    const ink = getComputedStyle(el).color;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = Math.round(size * dpr);
    cv.height = Math.round(size * dpr);

    const draw = (frame: EarthFrame) => {
      const k = (size * dpr) / VIEW;
      ctx.setTransform(k, 0, 0, k, 0, 0);
      ctx.clearRect(0, 0, VIEW, VIEW);
      ctx.strokeStyle = ink;
      ctx.fillStyle = ink;
      ctx.lineCap = "round";
      ctx.globalAlpha = frame.outline.opacity;
      ctx.lineWidth = frame.strokes[0]?.width ?? 1;
      ctx.beginPath();
      ctx.arc(VIEW / 2, VIEW / 2, frame.outline.r, 0, Math.PI * 2);
      ctx.stroke();
      for (const s of frame.strokes) {
        ctx.globalAlpha = s.opacity;
        ctx.lineWidth = s.width;
        ctx.beginPath();
        s.points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        ctx.stroke();
      }
      for (const n of [...frame.nodes, frame.satellite]) {
        ctx.globalAlpha = n.opacity;
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    };

    const tick = (t: number) => {
      raf = 0;
      if (!visible || document.hidden) return;
      const dt = last ? Math.min(0.1, (t - last) / 1000) : 0;
      last = t;
      spinSpeed = easeSpeed(spinSpeed, workingRef.current ? SPIN.working : SPIN.rest, dt);
      orbitSpeed = easeSpeed(orbitSpeed, workingRef.current ? ORBIT_SPEED.working : ORBIT_SPEED.rest, dt);
      spin += spinSpeed * dt;
      orbit += orbitSpeed * dt;
      draw(earthFrame(variant, spin, orbit));
      raf = requestAnimationFrame(tick);
    };
    const start = () => {
      if (!raf && visible && !document.hidden) {
        last = 0;
        raf = requestAnimationFrame(tick);
      }
    };

    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible) start();
    });
    io.observe(el);
    const onVisibility = () => start();
    document.addEventListener("visibilitychange", onVisibility);

    // After the page is idle: the text first, the motion second.
    type IdleWindow = Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number };
    const w = window as IdleWindow;
    let idleId = 0;
    const begin = () => {
      draw(earthFrame(variant, spin, orbit));
      setLive(true);
      start();
    };
    if (typeof w.requestIdleCallback === "function") idleId = w.requestIdleCallback(begin, { timeout: 1500 });
    else idleId = window.setTimeout(begin, 300);

    return () => {
      if (typeof w.requestIdleCallback === "function" && "cancelIdleCallback" in window) {
        (window as Window & { cancelIdleCallback: (id: number) => void }).cancelIdleCallback(idleId);
      } else window.clearTimeout(idleId);
      if (raf) cancelAnimationFrame(raf);
      io.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [variant, size]);

  const frame = earthFrame(variant, 0.6, 0.9);
  return (
    <span
      ref={host}
      className={`ionexa-earth relative inline-block shrink-0 ${className}`}
      style={{ width: size, height: size }}
      data-earth={variant}
      data-live={live ? "true" : "false"}
      {...(label ? { role: "img", "aria-label": label } : { "aria-hidden": true })}
    >
      <svg
        viewBox={`0 0 ${VIEW} ${VIEW}`}
        width={size}
        height={size}
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        className={live ? "invisible absolute inset-0" : "absolute inset-0"}
        aria-hidden="true"
      >
        <circle cx={VIEW / 2} cy={VIEW / 2} r={frame.outline.r} strokeOpacity={frame.outline.opacity} strokeWidth={frame.strokes[0]?.width ?? 1} />
        {frame.strokes.map((s, i) => (
          <path key={i} d={strokePath(s.points)} strokeOpacity={s.opacity} strokeWidth={s.width} />
        ))}
        {[...frame.nodes, frame.satellite].map((n, i) => (
          <circle key={`n${i}`} cx={n.x} cy={n.y} r={n.r} fill="currentColor" stroke="none" fillOpacity={n.opacity} />
        ))}
      </svg>
      {variant !== "logo" && (
        <canvas
          ref={canvas}
          width={size}
          height={size}
          className={live ? "absolute inset-0" : "invisible absolute inset-0"}
          style={{ width: size, height: size }}
          aria-hidden="true"
        />
      )}
    </span>
  );
}
