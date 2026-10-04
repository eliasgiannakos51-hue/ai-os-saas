/*
 * IONEXA SITE PLAYERS — the only script a cinematic site runs.
 *
 * A generated page never carries its own JavaScript. The model writes HTML
 * and data attributes; this file reads them. That keeps every published
 * site inside one reviewed script, which is what the publishing sandbox
 * and the scanner's allowlist can hold (src/lib/publishing/public-serving.ts).
 *
 *   data-ix="loop"      a looping clip: <video> when data-src is given, or
 *                       frames from a registered source; plays only on screen
 *   data-ix="sequence"  an image sequence the SCROLL drives through a tall
 *                       section (class ix-scrub, with a sticky inner)
 *   data-ix="rotate"    the same, wrapped through 360°, and draggable
 *   data-ix-depth="n"   a parallax layer: moves n × the scroll, within its section
 *
 * EVERY PLAYER STARTS FROM A POSTER that is already in the HTML: an <img>
 * with real alt text. Without JavaScript, with reduced motion, with
 * Save-Data or on a 2G/3G connection, the poster is what stays — the page
 * is whole without the motion, never waiting for it.
 */
(function () {
  "use strict";
  var mq = function (q) { return window.matchMedia ? window.matchMedia(q).matches : false; };
  var conn = navigator.connection || {};
  var reduced = mq("(prefers-reduced-motion: reduce)");
  var slowNet = !!conn.saveData || /(^|-)(2g|3g)$/.test(conn.effectiveType || "");
  var still = reduced || slowNet;
  var phone = function () { return mq("(max-width: 760px)"); };
  var sources = {};
  var players = [];
  var raf = 0;

  function pick(el, name) {
    var m = el.getAttribute("data-" + name + "-mobile");
    return phone() && m ? m : el.getAttribute("data-" + name);
  }
  function inView(el, margin) {
    var r = el.getBoundingClientRect();
    return r.bottom > -margin && r.top < window.innerHeight + margin;
  }
  function canvasOver(el) {
    var c = document.createElement("canvas");
    c.className = "ix-canvas";
    c.setAttribute("aria-hidden", "true");
    el.appendChild(c);
    return c;
  }
  // object-fit: cover, on a canvas.
  function cover(ctx, img, w, h) {
    if (img.draw) { ctx.clearRect(0, 0, w, h); img.draw(ctx, w, h); return; }
    var iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
    if (!iw || !ih) return;
    var s = Math.max(w / iw, h / ih), dw = iw * s, dh = ih * s;
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
  }
  function size(c) {
    var r = c.getBoundingClientRect(), d = Math.min(window.devicePixelRatio || 1, 2);
    var w = Math.max(1, Math.round(r.width * d)), h = Math.max(1, Math.round(r.height * d));
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    return [w, h];
  }

  // Frames: real files from a pattern ("media/f{000}.webp"), or a registered
  // source (the samples' storyboards, until the media exists). Frame 0
  // first, then every 8th so a fast scroll always has something near, then
  // the rest — nothing is fetched before the player is close to the screen.
  function frameSet(el) {
    var n = Number(pick(el, "count")) || 0;
    var pattern = pick(el, "frames") || "";
    var set = { n: n, frames: new Array(n), loaded: 0 };
    if (pattern.indexOf("source:") === 0) {
      var make = sources[pattern.slice(7)];
      if (!make) return null;            // not registered yet: asked again on the next tick
      set.frames = make(n); set.loaded = n;
      return set;
    }
    var order = [0];
    for (var i = 8; i < n; i += 8) order.push(i);
    for (var j = 1; j < n; j++) if (order.indexOf(j) < 0) order.push(j);
    var k = 0, busy = 0;
    function next() {
      while (busy < 6 && k < order.length) {
        (function (idx) {
          busy++;
          var img = new Image();
          img.decoding = "async";
          img.onload = function () { set.frames[idx] = img; set.loaded++; busy--; next(); kick(); };
          img.onerror = function () { busy--; next(); };
          img.src = pattern.replace(/\{(0+)\}/, function (_, z) { var s = String(idx); while (s.length < z.length) s = "0" + s; return s; });
        })(order[k++]);
      }
    }
    set.start = next;
    return set;
  }
  function nearest(set, i) {
    for (var d = 0; d < set.n; d++) {
      if (set.frames[i - d]) return set.frames[i - d];
      if (set.frames[i + d]) return set.frames[i + d];
    }
    return null;
  }
  function progressOf(el) {
    var root = el.closest(".ix-scrub") || el;
    var r = root.getBoundingClientRect(), span = r.height - window.innerHeight;
    if (span <= 0) return 0;
    return Math.min(1, Math.max(0, -r.top / span));
  }

  function sequence(el, wrap) {
    var p = { el: el, kind: wrap ? "rotate" : "sequence", mode: "poster", set: null, canvas: null, drag: 0 };
    p.tick = function () {
      if (!p.set) {
        if (!inView(el, window.innerHeight)) return;
        p.set = frameSet(el);
        if (!p.set) return;
        p.canvas = canvasOver(el);
        if (p.set.start) p.set.start();
      }
      var prog = progressOf(el);
      var turns = wrap ? Number(el.getAttribute("data-turns") || 1) : 1;
      var i = wrap ? Math.floor((((prog * turns + p.drag) % 1) + 1) % 1 * p.set.n) : Math.round(prog * (p.set.n - 1));
      var img = nearest(p.set, i);
      if (!img) return;
      var wh = size(p.canvas);
      cover(p.canvas.getContext("2d"), img, wh[0], wh[1]);
      if (p.mode === "poster") { p.mode = "frames"; el.classList.add("ix-live"); }
      p.frame = i;
    };
    if (wrap) {
      var x0 = null, d0 = 0;
      el.addEventListener("pointerdown", function (e) { x0 = e.clientX; d0 = p.drag; el.setPointerCapture(e.pointerId); });
      el.addEventListener("pointermove", function (e) { if (x0 === null) return; p.drag = d0 - (e.clientX - x0) / Math.max(200, el.clientWidth); kick(); });
      el.addEventListener("pointerup", function () { x0 = null; });
      el.addEventListener("pointercancel", function () { x0 = null; });
    }
    return p;
  }

  function loop(el) {
    var p = { el: el, kind: "loop", mode: "poster", video: null, set: null, canvas: null, t0: 0 };
    var speed = Number(el.getAttribute("data-speed") || 1);
    p.tick = function (now) {
      var on = inView(el, 0) && !document.hidden;
      var src = pick(el, "src");
      if (src) {
        if (!p.video && on) {
          var v = p.video = document.createElement("video");
          v.muted = true; v.loop = true; v.playsInline = true; v.preload = "auto";
          v.setAttribute("muted", ""); v.setAttribute("playsinline", ""); v.setAttribute("aria-hidden", "true");
          v.className = "ix-canvas";
          v.poster = (el.querySelector("img") || {}).currentSrc || "";
          v.src = src;
          v.playbackRate = speed;
          v.addEventListener("playing", function () { p.mode = "video"; el.classList.add("ix-live"); });
          el.appendChild(v);
        }
        if (p.video) { if (on && p.video.paused) p.video.play().catch(function () {}); if (!on && !p.video.paused) p.video.pause(); }
        return;
      }
      p.animating = on;
      if (!on) return;
      if (!p.set) { p.set = frameSet(el); if (!p.set) return; p.canvas = canvasOver(el); if (p.set.start) p.set.start(); p.t0 = now; }
      if (!p.set.n) return;
      var fps = Number(el.getAttribute("data-fps") || 24) * speed;
      var i = Math.floor(((now - p.t0) / 1000) * fps) % p.set.n;
      var img = p.set.frames[i] || nearest(p.set, i);
      if (!img) return;
      var wh = size(p.canvas);
      cover(p.canvas.getContext("2d"), img, wh[0], wh[1]);
      if (p.mode === "poster") { p.mode = "frames"; el.classList.add("ix-live"); }
      p.frame = i;
    };
    return p;
  }

  function parallax(el) {
    var depth = Number(el.getAttribute("data-ix-depth")) || 0;
    var p = { el: el, kind: "parallax", mode: "still" };
    p.tick = function () {
      var host = el.closest("section") || document.body;
      var r = host.getBoundingClientRect();
      if (r.bottom < 0 || r.top > window.innerHeight) return;
      el.style.transform = "translate3d(0," + (-r.top * depth).toFixed(1) + "px,0)";
      p.mode = "moving";
    };
    return p;
  }

  function frame(now) {
    raf = 0;
    var again = false;
    for (var i = 0; i < players.length; i++) {
      players[i].tick(now);
      if (players[i].kind === "loop" && players[i].animating) again = true;
    }
    if (again && !document.hidden) raf = requestAnimationFrame(frame);
  }
  function kick() { if (!raf) raf = requestAnimationFrame(frame); }

  function init() {
    document.documentElement.classList.add(still ? "ix-still" : "ix-motion");
    if (still) return;
    var els = document.querySelectorAll("[data-ix]");
    for (var i = 0; i < els.length; i++) {
      var k = els[i].getAttribute("data-ix");
      if (k === "loop") players.push(loop(els[i]));
      else if (k === "sequence") players.push(sequence(els[i], false));
      else if (k === "rotate") players.push(sequence(els[i], true));
    }
    var deep = document.querySelectorAll("[data-ix-depth]");
    for (var j = 0; j < deep.length; j++) players.push(parallax(deep[j]));
    window.addEventListener("scroll", kick, { passive: true });
    window.addEventListener("resize", kick);
    document.addEventListener("visibilitychange", function () { if (!document.hidden) kick(); else players.forEach(function (p) { if (p.video) p.video.pause(); }); });
    kick();
  }

  window.IonexaPlayers = {
    // A named frame source: function (count) → array of drawables.
    source: function (name, make) { sources[name] = make; kick(); },
    state: function () {
      return { still: still, reduced: reduced, slowNet: slowNet, players: players.map(function (p) {
        return { kind: p.kind, mode: p.mode, frame: p.frame, loaded: p.set ? p.set.loaded : null, of: p.set ? p.set.n : null };
      }) };
    }
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
