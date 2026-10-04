/*
 * SAMPLE-ONLY. Two things a real cinematic site does not have:
 *
 *   1. STORYBOARDS standing in for the AI media until it is generated —
 *      line drawings of what the image and the clip will show, registered
 *      as frame sources so the real players (ionexa-players.js) run on them
 *      exactly as they will on WebP frames. Each is labelled on the page.
 *      scripts/cinematic-media.mjs replaces them with the generated media.
 *   2. A LANGUAGE SWITCH (Greek in the HTML, English and Arabic from the
 *      page's #i18n block), so every layout can be read in all three. A
 *      real site is one page per language.
 */
(function () {
  "use strict";
  var css = function (name, fallback) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback; };
  var TAU = Math.PI * 2;
  function frames(n, draw) {
    var out = [];
    for (var i = 0; i < n; i++) (function (t) { out.push({ draw: function (ctx, w, h) { draw(ctx, w, h, t); } }); })(n > 1 ? i / n : 0);
    return out;
  }
  function pen(ctx, w, color, alpha) { ctx.strokeStyle = color; ctx.globalAlpha = alpha == null ? 1 : alpha; ctx.lineWidth = Math.max(1.2, w / 520); ctx.lineCap = "round"; ctx.lineJoin = "round"; }

  // The café: a cup on its saucer, steam rising — a loop whose last frame
  // meets its first, because every motion is a whole number of turns.
  function cup(ctx, w, h, t) {
    var ink = css("--sb-ink", "#c07a45"), s = Math.min(w, h), cx = w / 2, cy = h * 0.62;
    pen(ctx, w, ink, 0.95);
    ctx.beginPath(); ctx.ellipse(cx, cy + s * 0.13, s * 0.30, s * 0.055, 0, 0, TAU); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx - s * 0.19, cy - s * 0.08); ctx.bezierCurveTo(cx - s * 0.19, cy + s * 0.1, cx - s * 0.12, cy + s * 0.13, cx, cy + s * 0.13);
    ctx.bezierCurveTo(cx + s * 0.12, cy + s * 0.13, cx + s * 0.19, cy + s * 0.1, cx + s * 0.19, cy - s * 0.08); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(cx, cy - s * 0.08, s * 0.19, s * 0.035, 0, 0, TAU); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(cx + s * 0.225, cy - s * 0.01, s * 0.045, s * 0.06, 0, -1.3, 1.6); ctx.stroke();
    for (var k = 0; k < 3; k++) {
      var x0 = cx + (k - 1) * s * 0.07, ph = TAU * t + k * 2.1;
      pen(ctx, w, ink, 0.55 - k * 0.1);
      ctx.beginPath();
      for (var y = 0; y <= 1; y += 0.04) {
        var yy = cy - s * 0.13 - y * s * 0.42, xx = x0 + Math.sin(ph + y * 5) * s * 0.03 * (0.4 + y);
        if (y === 0) ctx.moveTo(xx, yy); else ctx.lineTo(xx, yy);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  // The cava: a bottle turning through 360°, its label coming round.
  function bottle(ctx, w, h, t) {
    var ink = css("--sb-ink", "#c9a45c"), s = Math.min(w, h), cx = w / 2, top = h * 0.12, bw = s * 0.12;
    pen(ctx, w, ink, 0.95);
    ctx.beginPath();
    ctx.moveTo(cx - s * 0.025, top); ctx.lineTo(cx - s * 0.025, top + s * 0.2);
    ctx.bezierCurveTo(cx - s * 0.03, top + s * 0.28, cx - bw, top + s * 0.3, cx - bw, top + s * 0.38);
    ctx.lineTo(cx - bw, h * 0.88); ctx.quadraticCurveTo(cx, h * 0.9, cx + bw, h * 0.88);
    ctx.lineTo(cx + bw, top + s * 0.38); ctx.bezierCurveTo(cx + bw, top + s * 0.3, cx + s * 0.03, top + s * 0.28, cx + s * 0.025, top + s * 0.2);
    ctx.lineTo(cx + s * 0.025, top); ctx.closePath(); ctx.stroke();
    ctx.beginPath(); ctx.rect(cx - s * 0.03, top - s * 0.005, s * 0.06, s * 0.09); ctx.stroke();
    // The label is a band on a cylinder: its edges are sines of the angle.
    var a = TAU * t, half = 0.9, lt = h * 0.55, lb = h * 0.76;
    var e1 = Math.sin(a - half), e2 = Math.sin(a + half), front = Math.cos(a) > -Math.cos(half);
    if (front) {
      var x1 = cx + bw * Math.max(-1, Math.min(1, e1)), x2 = cx + bw * Math.max(-1, Math.min(1, e2));
      pen(ctx, w, ink, 0.9);
      ctx.beginPath(); ctx.rect(Math.min(x1, x2), lt, Math.abs(x2 - x1), lb - lt); ctx.stroke();
      var mid = cx + bw * Math.sin(a), lw = Math.abs(x2 - x1) * 0.6;
      pen(ctx, w, ink, 0.6);
      [0.3, 0.45, 0.62].forEach(function (f, i) { ctx.beginPath(); ctx.moveTo(mid - lw / 2 * (i ? 0.7 : 1), lt + (lb - lt) * f); ctx.lineTo(mid + lw / 2 * (i ? 0.7 : 1), lt + (lb - lt) * f); ctx.stroke(); });
    }
    pen(ctx, w, ink, 0.35);
    var hx = cx + bw * 0.8 * Math.sin(a + 2.4);
    ctx.beginPath(); ctx.moveTo(hx, top + s * 0.42); ctx.lineTo(hx, h * 0.84); ctx.stroke();
    ctx.globalAlpha = 1;
  }
  // The hotel: the caldera at dusk, white houses rising out of the cliff,
  // the sun going down, a blue dome last.
  function hotel(ctx, w, h, t) {
    var ink = css("--sb-ink", "#1c3a5e"), sun = css("--sb-sun", "#e08a3c");
    // The cliff rises on the right, where the title is not: the left of
    // the frame is open sea and sky, kept for the type.
    // A phone gets its own, upright composition (the brief: "κάθετο κάδρο"),
    // with the top half left to the title.
    var tall = h > w, sea = h * (tall ? 0.7 : 0.62);
    var cliff = function (x) { var u = Math.max(0, (x / w - 0.36) / 0.64); return x < 0.36 * w ? h * 0.94 : h * (0.94 - (tall ? 0.2 : 0.34) * Math.pow(u, 0.8)); };
    pen(ctx, w, ink, 0.35);
    ctx.beginPath(); ctx.moveTo(0, sea); ctx.lineTo(w, sea); ctx.stroke();
    pen(ctx, w, sun, 0.9);
    ctx.beginPath(); ctx.arc(w * (tall ? 0.72 : 0.6), tall ? sea - h * (0.16 - t * 0.12) : h * (0.2 + t * 0.24), Math.min(w, h) * (tall ? 0.07 : 0.05), 0, TAU); ctx.stroke();
    pen(ctx, w, ink, 0.9);
    ctx.beginPath(); for (var x = 0; x <= w; x += w / 60) { if (x === 0) ctx.moveTo(x, cliff(x)); else ctx.lineTo(x, cliff(x)); } ctx.stroke();
    // Houses cascade down the slope: each column sits on the cliff, and a
    // second, smaller house sits on the first.
    var HOUSES = window.__sbHouses = window.__sbHouses || (function () {
      var out = [];
      for (var c = 0; c < 9; c++) {
        var x = (0.42 + c * 0.058), bw = 0.045 + (c % 3) * 0.007, bh = 0.065 + (c % 2) * 0.02;
        out.push({ x: x, bw: bw, bh: bh, on: null });
        if (c % 2 === 0) out.push({ x: x + 0.012, bw: bw * 0.7, bh: bh * 0.75, on: out.length - 1 });
      }
      return out;
    })();
    var tops = [];
    HOUSES.forEach(function (b, i) {
      var start = (i / HOUSES.length) * 0.78, grow = Math.max(0, Math.min(1, (t - start) / 0.18));
      var hh = tall ? b.bh * w * 1.1 : b.bh * h;
      var x = b.x * w, bw = b.bw * w, base = b.on === null ? Math.min(cliff(x), cliff(x + bw)) + 2 : tops[b.on];
      var bh = hh * grow;
      tops[i] = base - hh;
      if (!grow || base == null) return;
      pen(ctx, w, ink, 0.85);
      ctx.beginPath(); ctx.rect(x, base - bh, bw, bh); ctx.stroke();
      if (grow === 1) { pen(ctx, w, ink, 0.45); ctx.beginPath(); ctx.rect(x + bw * 0.38, base - bh * 0.6, bw * 0.24, bh * 0.4); ctx.stroke(); }
    });
    if (t > 0.86) {
      var g = (t - 0.86) / 0.14, d = HOUSES[6], dx = (d.x + d.bw / 2) * w, dy = tops[6];
      pen(ctx, w, sun, 0.95 * g);
      ctx.beginPath(); ctx.arc(dx, dy, d.bw * w * 0.32, Math.PI, 0); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(dx, dy - d.bw * w * 0.32); ctx.lineTo(dx, dy - d.bw * w * 0.5); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  function register() {
    if (!window.IonexaPlayers) return setTimeout(register, 30);
    window.IonexaPlayers.source("cup", function (n) { return frames(n, cup); });
    window.IonexaPlayers.source("bottle", function (n) { return frames(n, bottle); });
    window.IonexaPlayers.source("hotel", function (n) { return frames(n, hotel); });
  }
  register();

  // ---- the language switch ----
  var T = null;
  try { T = JSON.parse(document.getElementById("i18n").textContent); } catch (e) {}
  var original = {};
  function setLang(l) {
    var nodes = document.querySelectorAll("[data-t]");
    for (var i = 0; i < nodes.length; i++) {
      var k = nodes[i].getAttribute("data-t");
      if (!(k in original)) original[k] = nodes[i].innerHTML;
      var v = l === "el" ? original[k] : T && T[l] && T[l][k];
      if (v != null) nodes[i].innerHTML = v;
    }
    var ph = document.querySelectorAll("[data-tp]");
    for (var j = 0; j < ph.length; j++) {
      var key = ph[j].getAttribute("data-tp");
      if (!(("p:" + key) in original)) original["p:" + key] = ph[j].getAttribute("aria-label") || "";
      var lab = l === "el" ? original["p:" + key] : T && T[l] && T[l][key];
      if (lab != null) ph[j].setAttribute("aria-label", lab);
    }
    document.documentElement.lang = l;
    document.documentElement.dir = l === "ar" ? "rtl" : "ltr";
    var bs = document.querySelectorAll(".sample-lang button");
    for (var b = 0; b < bs.length; b++) bs[b].setAttribute("aria-pressed", String(bs[b].getAttribute("data-lang") === l));
  }
  document.addEventListener("click", function (e) {
    var b = e.target.closest && e.target.closest(".sample-lang button");
    if (b) setLang(b.getAttribute("data-lang"));
  });
  // A booking or order form in a sample has nowhere to go: say so.
  document.addEventListener("submit", function (e) {
    e.preventDefault();
    var out = e.target.querySelector("output");
    if (out) out.hidden = false;
  });
  window.sample = { lang: setLang };
})();
