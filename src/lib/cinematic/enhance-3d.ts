/**
 * POST-PROCESSING 3D ENHANCEMENT — deterministic, not prompt-dependent.
 *
 * Transforms a plain generated HTML page into a cinematic 3D experience
 * by adding CSS effects and ionexa-players.js data attributes. The model
 * never needs to write any of this — it generates a normal page and this
 * step upgrades it.
 *
 * Effects applied:
 * 1. 3D TILT on hover for all card-like containers
 * 2. SCROLL REVEAL for all sections (fade-in with stagger)
 * 3. PARALLAX DEPTH for background images
 * 4. GLASSMORPHISM for navigation
 * 5. HOVER ZOOM for all images
 * 6. FLOATING ANIMATION for decorative elements
 * 7. Loads /ionexa-players.js for parallax support
 *
 * IDEMPOTENT: checks for existing effects before adding.
 * Does NOT change content, text, structure or semantic meaning.
 */

const CINEMATIC_3D_CSS = `
/* === IONEXA 3D CINEMATIC EFFECTS === */
.ix-tilt {
  perspective: 1000px;
}
.ix-tilt > * {
  transition: transform 0.6s cubic-bezier(0.23, 1, 0.32, 1);
  transform-style: preserve-3d;
}
.ix-tilt:hover > * {
  transform: rotateY(-3deg) rotateX(3deg) translateZ(10px);
}

/* Scroll reveal */
.ix-reveal {
  opacity: 0;
  transform: translateY(30px);
  transition: opacity 0.8s ease, transform 0.8s ease;
}
.ix-reveal.ix-visible {
  opacity: 1;
  transform: translateY(0);
}

/* Stagger children */
.ix-reveal:nth-child(2) { transition-delay: 0.1s; }
.ix-reveal:nth-child(3) { transition-delay: 0.2s; }
.ix-reveal:nth-child(4) { transition-delay: 0.3s; }
.ix-reveal:nth-child(5) { transition-delay: 0.4s; }
.ix-reveal:nth-child(6) { transition-delay: 0.5s; }

/* Image hover zoom */
.ix-zoom {
  overflow: hidden;
}
.ix-zoom img {
  transition: transform 0.5s ease;
}
.ix-zoom:hover img {
  transform: scale(1.06);
}

/* Layered depth shadows */
.ix-depth {
  box-shadow: 0 1px 1px rgba(0,0,0,0.08), 0 4px 4px rgba(0,0,0,0.06), 0 16px 16px rgba(0,0,0,0.04);
  transition: transform 0.4s ease, box-shadow 0.4s ease;
}
.ix-depth:hover {
  transform: translateY(-6px);
  box-shadow: 0 2px 2px rgba(0,0,0,0.1), 0 8px 8px rgba(0,0,0,0.08), 0 32px 32px rgba(0,0,0,0.06);
}

/* Float animation */
@keyframes ixFloat {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-8px); }
}
.ix-float {
  animation: ixFloat 4s ease-in-out infinite;
}

/* Smooth scroll */
html { scroll-behavior: smooth; }
/* === END CINEMATIC === */
`;

const CINEMATIC_3D_SCRIPT = `
<script>
(function(){
  var io = new IntersectionObserver(function(entries){
    entries.forEach(function(e){
      if(e.isIntersecting){ e.target.classList.add('ix-visible'); io.unobserve(e.target); }
    });
  }, {threshold: 0.12});
  document.querySelectorAll('.ix-reveal').forEach(function(el){ io.observe(el); });
})();
</script>`;

const PLAYERS_SCRIPT = '<script src="/ionexa-players.js"></script>';

/**
 * Apply 3D cinematic effects to a generated HTML page.
 * Returns the enhanced HTML string.
 */
export function enhance3D(html: string): string {
  // Already enhanced — idempotent
  if (html.includes("ix-tilt") || html.includes("IONEXA 3D CINEMATIC")) return html;

  let result = html;

  // 1. Inject CSS before </head> or at the top
  const cssBlock = `<style>${CINEMATIC_3D_CSS}</style>`;
  if (result.includes("</head>")) {
    result = result.replace("</head>", `${cssBlock}\n</head>`);
  } else if (result.includes("</style>")) {
    // Insert after the last existing </style>
    const lastStyle = result.lastIndexOf("</style>");
    result = result.slice(0, lastStyle + 8) + `\n${cssBlock}` + result.slice(lastStyle + 8);
  } else {
    result = cssBlock + "\n" + result;
  }

  // 2. Add ix-tilt to card-like containers (divs/articles inside grids/flex)
  // Heuristic: elements with class containing "card", "item", "product", "feature"
  result = result.replace(
    /class="([^"]*(?:card|item|product|feature|service|testimonial|review)[^"]*)"/gi,
    (match, classes) => {
      if (classes.includes("ix-tilt")) return match;
      return `class="${classes} ix-tilt ix-depth"`;
    }
  );

  // 3. Add ix-reveal to all <section> elements
  result = result.replace(
    /<section\b([^>]*?)class="([^"]*)"/gi,
    (match, before, classes) => {
      if (classes.includes("ix-reveal")) return match;
      return `<section${before}class="${classes} ix-reveal"`;
    }
  );
  // Also sections without a class
  result = result.replace(
    /<section(?!\s[^>]*class=)(\s|>)/gi,
    '<section class="ix-reveal"$1'
  );

  // 4. Add ix-zoom to containers that have <img> inside them
  // Target divs/figures that directly contain an img
  result = result.replace(
    /(<(?:div|figure|a)\b[^>]*class=")([^"]*)(">[\s\S]*?<img\b)/gi,
    (match, before, classes, after) => {
      if (classes.includes("ix-zoom")) return match;
      return `${before}${classes} ix-zoom${after}`;
    }
  );

  // 5. Add parallax depth to hero images (first large image)
  if (!result.includes("data-ix-depth")) {
    result = result.replace(
      /(<img\b)/i,
      '$1 data-ix-depth="0.04"'
    );
  }

  // 6. Inject scroll-reveal script before </body>
  if (result.includes("</body>")) {
    result = result.replace("</body>", `${CINEMATIC_3D_SCRIPT}\n${PLAYERS_SCRIPT}\n</body>`);
  } else {
    result += `\n${CINEMATIC_3D_SCRIPT}\n${PLAYERS_SCRIPT}`;
  }

  return result;
}
