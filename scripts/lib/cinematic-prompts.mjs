// The image and video prompts a cinematic site is made from — written by
// us, never by the person (the brief, §4). One template per style, three
// variants each, composed with the subject the industry table gives and the
// palette the brand gives.
//
// The variants differ in ONE thing each, so that when one wins the reason is
// readable: light (golden hour vs soft window light vs studio), lens (85mm
// shallow vs 50mm), and how much room is left around the subject. The trial
// that picks the winner is scripts/cinematic-media.mjs; the reasons are
// written in docs/v6-cinematic-sites-2026-10-03.md once it has run.
//
// What every prompt carries, whatever the style:
//   photorealistic, cinematic, natural light; shallow depth of field for
//   bokeh; the subject centred with room around it for the type; the brand's
//   palette — and the negative list, which is the part a person would forget.

export const NEGATIVE =
  "no text, no letters, no words, no logos, no watermarks, no brand names, no real or recognisable people, no faces, " +
  "no hands with extra fingers, no warped geometry, no duplicated objects, no frames or borders";

const BASE = "Photorealistic, cinematic, natural light, high dynamic range, fine detail, shot on a full-frame camera.";

export const STYLE_PROMPTS = {
  // A — one subject, centred, a loop that never jumps.
  A: {
    image: [
      (s) => `${BASE} ${s.subject}, centred in the frame with generous empty space on all sides. Golden-hour side light, 85mm lens at f/1.8, very shallow depth of field, soft round bokeh in ${s.palette}. ${s.mood}`,
      (s) => `${BASE} ${s.subject}, centred, small in the frame, lots of negative space. Soft window light from the left, 50mm lens at f/2.8, gentle bokeh in ${s.palette}. ${s.mood}`,
      (s) => `${BASE} ${s.subject} on a dark surface, centred with wide margins. Low-key studio light, a single warm key light, 100mm macro at f/2, deep bokeh in ${s.palette}. ${s.mood}`,
    ],
    video: [
      (s) => `${s.motion}. The camera is locked off and does not move. Subtle, slow, continuous motion only. The last frame is identical to the first so the clip loops without a jump.`,
      (s) => `${s.motion}. Very slow push-in of a few percent, then back to the starting framing by the end, so the first and last frames match. Calm, no cuts.`,
      (s) => `${s.motion}. A slow, small orbit of the camera around the subject, returning exactly to where it started. No cuts, no zoom.`,
    ],
  },
  // B — a build the scroll will drive through: a start, an end, a clip between.
  B: {
    image: [
      (s) => `${BASE} ${s.end}. Wide establishing shot at golden hour, 35mm lens, the subject in the lower half with open sky above for the title. ${s.palette} tones. ${s.mood}`,
      (s) => `${BASE} ${s.end}. Blue hour just after sunset, warm lights coming on, 35mm, subject in the lower half, sky above. ${s.palette} tones. ${s.mood}`,
      (s) => `${BASE} ${s.end}. Late afternoon, soft haze over the sea, 50mm, subject centred low in the frame. ${s.palette} tones. ${s.mood}`,
    ],
    start: (s) => `${BASE} ${s.start}. The same viewpoint, light and framing as the finished scene, before anything is built.`,
    video: [
      (s) => `${s.motion}. Time-lapse feeling, the camera fixed on the same viewpoint from the first frame to the last, steady progress, no cuts.`,
      (s) => `${s.motion}. Smooth, even pace from start to finish, the camera fixed, the light changing slowly towards dusk.`,
      (s) => `${s.motion}. The camera rises very slowly while the scene completes, ending on the finished view. No cuts.`,
    ],
  },
  // C — the product turns through 360°, which becomes a frame sequence.
  C: {
    image: [
      (s) => `${BASE} ${s.subject}, perfectly upright and centred, seen straight on at eye level, on a seamless ${s.palette} background with a soft reflection beneath. Three-point studio light, 85mm lens.`,
      (s) => `${BASE} ${s.subject}, upright and centred on a dark seamless background, a single rim light tracing the edges in ${s.palette}, 100mm lens.`,
      (s) => `${BASE} ${s.subject}, upright and centred on a ${s.palette} gradient, soft top light, crisp label edges, 85mm lens, slight low angle.`,
    ],
    video: [
      (s) => `The ${s.object} rotates slowly on a turntable through one full 360-degree turn at constant speed. The camera does not move. The lighting stays fixed. The last frame matches the first.`,
      (s) => `A smooth 360-degree turntable rotation of the ${s.object}, constant speed, locked-off camera, no wobble, no change in height or scale.`,
      (s) => `The camera orbits the ${s.object} once, a full circle at the same height and distance, constant speed, ending exactly where it started.`,
    ],
  },
};

// The three samples, as the industry table (§2 of the doc) would fill them.
export const SAMPLES = {
  cafe: {
    style: "A",
    subject: "a white ceramic espresso cup on its saucer, filled with espresso with a fine crema, thin steam rising",
    palette: "warm coffee brown, cream and copper",
    mood: "Calm, early morning, a small specialty coffee shop.",
    motion: "Thin wisps of steam rise and curl above the cup; nothing else moves",
  },
  hotel: {
    style: "B",
    end: "white cubic cave houses and a small boutique hotel with terraces and a blue dome, cascading down the Santorini caldera cliff above the Aegean sea, at sunset",
    start: "the bare volcanic caldera cliff of Santorini above the Aegean sea at sunset, with no buildings on it",
    palette: "whitewash, Aegean blue and dusk amber",
    mood: "Quiet luxury, no people.",
    motion: "White houses and terraces appear and rise along the cliff from the bottom up until the finished hotel stands on the caldera",
  },
  cava: {
    style: "C",
    subject: "a dark green bottle of Greek white wine with a plain cream label carrying no readable text, and a gold capsule",
    object: "wine bottle",
    palette: "deep burgundy and warm gold",
  },
};

export function promptsFor(name) {
  const s = SAMPLES[name];
  const t = STYLE_PROMPTS[s.style];
  return {
    style: s.style,
    images: t.image.map((f) => f(s)),
    start: t.start ? t.start(s) : null,
    videos: t.video.map((f) => f(s)),
    negative: NEGATIVE,
  };
}
