/* ionexa-3d.js — the one piece of JavaScript a 3D site runs.
 *
 * WHY THIS EXISTS INSTEAD OF MODEL-WRITTEN WEBGL. The website builder
 * forbids <script> in generated pages and website-html-security-scan.ts
 * strips every <script src> at generate, edit, publish and rollback. A 3D
 * level that asked the model to write Three.js would need that rule
 * removed, and would ship a different hand-rolled WebGL program on every
 * site, each one a fresh way to leave a visitor looking at a blank hero.
 *
 * So the model writes HTML and asks for motion with attributes:
 *   data-ionexa-3d="bowl" data-color data-accent data-glaze  -> a scene
 *   data-reveal                                              -> rises in
 *   data-parallax="0.12"                                     -> drifts
 *   data-sample-form                                         -> demo form
 * and this file, written once, served from our own origin, does the rest.
 *
 * THREE TIERS, decided before anything is drawn:
 *   full    a desktop with WebGL: the scene, steam, smooth scroll
 *   lite    a phone, or a weak machine: the scene alone, at 1x pixels
 *   static  no WebGL, reduced motion, Save-Data, a weak phone, or the
 *           libraries never arrived: the drawing in the HTML stays, and
 *           nothing is hidden waiting for a script
 * The page is readable before this file runs and stays readable if it
 * never does. Nothing in the CSS starts invisible.
 */
(function () {
  "use strict";
  var root = document.documentElement;
  var state = { tier: "static", reason: "", ready: "static", frames: 0, readyAt: null };
  window.ionexa3d = state;

  function decide() {
    var q = new URLSearchParams(location.search).get("tier");
    if (q === "full" || q === "lite" || q === "static") return [q, "forced"];
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return ["static", "reduced-motion"];
    var conn = navigator.connection;
    if (conn && conn.saveData) return ["static", "save-data"];
    if (typeof THREE === "undefined" || typeof gsap === "undefined") return ["static", "libs-missing"];
    var probe = document.createElement("canvas");
    var gl = null;
    try { gl = probe.getContext("webgl2") || probe.getContext("webgl"); } catch (e) { gl = null; }
    if (!gl) return ["static", "no-webgl"];
    var cores = navigator.hardwareConcurrency || 8;
    var mem = navigator.deviceMemory || 8;
    var weak = cores <= 4 || mem <= 4;
    var small = Math.min(innerWidth, innerHeight) < 600 || innerWidth < 820;
    if (weak && small) return ["static", "weak-phone"];
    if (weak || small) return ["lite", small ? "small-screen" : "weak-machine"];
    return ["full", "capable"];
  }

  function onReady(fn) {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", fn);
    else fn();
  }

  onReady(function () {
    var d = decide();
    state.tier = d[0]; state.reason = d[1];
    root.dataset.tier = state.tier;
    demoForms();
    if (state.tier === "static") { root.dataset.ready = "static"; return; }

    gsap.registerPlugin(ScrollTrigger);
    if (state.tier === "full" && typeof Lenis !== "undefined") smoothScroll();
    reveals();
    document.querySelectorAll("[data-ionexa-3d]").forEach(function (host) {
      try { scene(host); } catch (e) {
        // A scene that throws leaves the drawing exactly where it was.
        state.reason = "scene-error: " + (e && e.message);
      }
    });
  });

  /* ------------------------------------------------------------ scroll */
  function smoothScroll() {
    var lenis = new Lenis({ lerp: 0.1, smoothWheel: true });
    lenis.on("scroll", ScrollTrigger.update);
    gsap.ticker.add(function (t) { lenis.raf(t * 1000); });
    gsap.ticker.lagSmoothing(0);
    document.querySelectorAll('a[href^="#"]').forEach(function (a) {
      a.addEventListener("click", function (e) {
        var id = a.getAttribute("href");
        var el = id.length > 1 && document.querySelector(id);
        if (el) { e.preventDefault(); lenis.scrollTo(el, { offset: -20 }); }
      });
    });
  }

  function reveals() {
    gsap.utils.toArray("[data-reveal]").forEach(function (el) {
      gsap.from(el, { y: 28, opacity: 0, duration: 0.9, ease: "power3.out",
        scrollTrigger: { trigger: el, start: "top 88%", once: true } });
    });
    if (state.tier !== "full") return;
    gsap.utils.toArray("[data-parallax]").forEach(function (el) {
      var k = parseFloat(el.dataset.parallax) || 0.1;
      gsap.to(el, { yPercent: -k * 100, ease: "none",
        scrollTrigger: { trigger: el, start: "top bottom", end: "bottom top", scrub: true } });
    });
  }

  /* ------------------------------------------------------------- scene */
  function scene(host) {
    // getAttribute, not dataset: "data-ionexa-3d" does not become
    // dataset.ionexa3d - a dash before a digit is not camel-cased - and the
    // first version read undefined and drew nothing, silently.
    var kind = host.getAttribute("data-ionexa-3d");
    if (kind !== "bowl") return; // one scene in this sample; more are a list, not a rewrite
    var color = new THREE.Color(host.dataset.color || "#b4532d");
    var glaze = new THREE.Color(host.dataset.glaze || "#f1e3cf");
    var accent = new THREE.Color(host.dataset.accent || "#4f5d2f");
    var full = state.tier === "full";

    var renderer = new THREE.WebGLRenderer({ antialias: full, alpha: true, powerPreference: "low-power" });
    renderer.setPixelRatio(full ? Math.min(devicePixelRatio, 2) : 1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    host.appendChild(renderer.domElement);
    renderer.domElement.setAttribute("aria-hidden", "true");

    var sc = new THREE.Scene();
    var cam = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
    cam.position.set(0, 2.4, 7.2);
    cam.lookAt(0, 0.3, 0);

    sc.add(new THREE.HemisphereLight(0xfff3e2, 0x7a4a30, 1.2));
    var key = new THREE.DirectionalLight(0xffffff, 2.2); key.position.set(3, 5, 4); sc.add(key);
    var rim = new THREE.DirectionalLight(0xffc89a, 1.2); rim.position.set(-4, 2, -3); sc.add(rim);
    // A fill from the viewer's side, so the underside reads as glazed clay
    // rather than going to black.
    var fill = new THREE.DirectionalLight(0xfff0e0, 1.1); fill.position.set(0, 0.5, 6); sc.add(fill);

    var group = new THREE.Group(); sc.add(group);

    // The bowl is a turned profile, the way a potter makes one.
    var seg = full ? 96 : 48;
    var outer = [[0, -0.86], [0.5, -0.88], [0.6, -0.8], [0.92, -0.62], [1.22, -0.33], [1.45, 0.02], [1.57, 0.32], [1.6, 0.5]]
      .map(function (p) { return new THREE.Vector2(p[0], p[1]); });
    var bowl = new THREE.Mesh(new THREE.LatheGeometry(outer, seg),
      new THREE.MeshPhysicalMaterial({ color: color, roughness: 0.42, clearcoat: 0.7, clearcoatRoughness: 0.25, side: THREE.DoubleSide }));
    group.add(bowl);
    var lip = new THREE.Mesh(new THREE.TorusGeometry(1.585, 0.045, 16, seg),
      new THREE.MeshStandardMaterial({ color: glaze, roughness: 0.35 }));
    lip.rotation.x = Math.PI / 2; lip.position.y = 0.5; group.add(lip);
    var inside = new THREE.Mesh(new THREE.CircleGeometry(1.42, seg),
      new THREE.MeshStandardMaterial({ color: glaze.clone().multiplyScalar(0.92), roughness: 0.8 }));
    inside.rotation.x = -Math.PI / 2; inside.position.y = 0.3; group.add(inside);

    // What is in it: olives, tomatoes, a leaf - the accent colour is theirs.
    var food = new THREE.Group(); group.add(food);
    var olive = new THREE.MeshStandardMaterial({ color: accent, roughness: 0.3 });
    var tomato = new THREE.MeshStandardMaterial({ color: 0xc2412d, roughness: 0.25 });
    var yolk = new THREE.MeshStandardMaterial({ color: 0xe0a43a, roughness: 0.45 });
    var leaf = new THREE.MeshStandardMaterial({ color: 0x6d8a3e, roughness: 0.55, side: THREE.DoubleSide });
    var bits = [[olive, -0.55, 0.0, 0.2, 0.2], [tomato, 0.1, -0.35, 0.19, 0.19], [olive, 0.6, 0.25, 0.19, 0.2],
      [yolk, -0.1, 0.45, 0.16, 0.16], [tomato, -0.75, -0.45, 0.15, 0.15], [olive, 0.35, -0.75, 0.16, 0.17]];
    bits.forEach(function (b) {
      var m = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), b[0]);
      m.scale.set(b[3], b[4] * 0.9, b[3] * 1.15); m.position.set(b[1], 0.42, b[2]); food.add(m);
    });
    var lf = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 12), leaf);
    lf.scale.set(0.42, 0.03, 0.16); lf.position.set(0.15, 0.55, 0.2); lf.rotation.set(0.2, 0.6, 0.15); food.add(lf);

    // Steam: a handful of soft sprites, on capable machines only.
    var steam = [];
    if (full) {
      var c = document.createElement("canvas"); c.width = c.height = 64;
      var g = c.getContext("2d"); var grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      grd.addColorStop(0, "rgba(255,255,255,.55)"); grd.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
      var tex = new THREE.CanvasTexture(c);
      for (var i = 0; i < 14; i++) {
        var s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0 }));
        s.userData.seed = Math.random(); s.scale.setScalar(0.6); group.add(s); steam.push(s);
      }
    }

    group.rotation.set(0.12, -0.4, 0);

    // Scroll: the bowl turns once and steps aside as the hero leaves.
    gsap.to(group.rotation, { y: "+=" + Math.PI * 2, ease: "none",
      scrollTrigger: { trigger: host.closest("section") || host, start: "top top", end: "bottom top", scrub: 0.6 } });
    gsap.to(group.position, { x: 0.6, y: -0.4, ease: "none",
      scrollTrigger: { trigger: host.closest("section") || host, start: "top top", end: "bottom top", scrub: 0.6 } });

    // A pointer, where there is one, tilts it a little.
    var tilt = { x: 0, y: 0 };
    if (full) addEventListener("pointermove", function (e) {
      tilt.x = (e.clientY / innerHeight - 0.5) * 0.25; tilt.y = (e.clientX / innerWidth - 0.5) * 0.35;
    }, { passive: true });

    function size() {
      var r = renderer.domElement.getBoundingClientRect();
      var w = Math.max(1, Math.round(r.width)), h = Math.max(1, Math.round(r.height));
      renderer.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix();
    }
    size(); addEventListener("resize", size, { passive: true });

    // Only draw while it can be seen, and never in a background tab.
    var visible = true;
    new IntersectionObserver(function (es) { visible = es[0].isIntersecting; }).observe(host);
    var clock = new THREE.Clock();
    function frame() {
      requestAnimationFrame(frame);
      if (!visible || document.hidden) return;
      var t = clock.getElapsedTime();
      food.rotation.y = t * 0.15;
      group.rotation.x += ((0.12 + tilt.x) - group.rotation.x) * 0.05;
      cam.position.x += (tilt.y * 1.2 - cam.position.x) * 0.05; cam.lookAt(0, 0.3, 0);
      for (var i = 0; i < steam.length; i++) {
        var s = steam[i], k = (t * 0.18 + s.userData.seed) % 1;
        s.position.set(Math.sin((s.userData.seed + k) * 6) * 0.35, 0.6 + k * 2.2, Math.cos(s.userData.seed * 9) * 0.3);
        s.material.opacity = Math.sin(k * Math.PI) * 0.35; s.scale.setScalar(0.4 + k * 0.9);
      }
      renderer.render(sc, cam);
      state.frames++;
      if (state.frames === 1) { root.dataset.ready = "3d"; state.ready = "3d"; state.readyAt = Math.round(performance.now()); }
    }
    frame();

    // For the test: how much of the centre of the canvas is actually drawn.
    state.probe = function () {
      renderer.render(sc, cam);
      var gl = renderer.getContext(), w = gl.drawingBufferWidth, h = gl.drawingBufferHeight, n = 64;
      var px = new Uint8Array(n * n * 4);
      gl.readPixels(Math.floor(w / 2 - n / 2), Math.floor(h / 2 - n / 2), n, n, gl.RGBA, gl.UNSIGNED_BYTE, px);
      var drawn = 0; for (var i = 3; i < px.length; i += 4) if (px[i] > 0) drawn++;
      return drawn / (n * n);
    };
  }

  /* -------------------------------------------------------- the form */
  function demoForms() {
    document.querySelectorAll("form[data-sample-form]").forEach(function (f) {
      f.addEventListener("submit", function (e) {
        e.preventDefault();
        var out = f.querySelector(".sent");
        if (out) out.textContent = "Στάλθηκε — σε αυτό το δείγμα δεν πάει πουθενά.";
      });
    });
  }
})();
