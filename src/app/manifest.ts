import type { MetadataRoute } from "next";

/**
 * The manifest fields Next's own type does not know about yet.
 *
 * `MetadataRoute.Manifest` still describes screenshots without a
 * `form_factor`, share_target without named params, file_handlers as a
 * bare mime map and no launch_handler at all — so the four things this
 * file exists to declare are exactly the four it would reject. Next does
 * not validate the object; it serialises it. Widening the RETURN TYPE is
 * therefore the honest fix, and keeping each field typed here (rather than
 * casting the whole object to `any`) is what still catches a typo in one.
 */
type WebManifest = Omit<
  MetadataRoute.Manifest,
  "screenshots" | "share_target" | "file_handlers" | "launch_handler"
> & {
  launch_handler?: { client_mode: "auto" | "focus-existing" | "navigate-existing" | "navigate-new" };
  screenshots?: {
    src: string;
    sizes: string;
    type: string;
    form_factor?: "narrow" | "wide";
    label?: string;
  }[];
  share_target?: {
    action: string;
    method: "GET" | "POST";
    enctype?: string;
    params: {
      title?: string;
      text?: string;
      url?: string;
      files?: { name: string; accept: string[] }[];
    };
  };
  file_handlers?: {
    action: string;
    accept: Record<string, string[]>;
    launch_type?: "single-client" | "multiple-clients";
  }[];
};

/**
 * The web app manifest — what a browser reads to decide what this site is
 * called, what it looks like installed, and what the operating system may
 * hand it.
 *
 * It did not exist before, and that is the whole of the "my site is called
 * Vercel on my phone" bug. With no manifest and no
 * apple-mobile-web-app-title, Chrome and Safari fall back to whatever they
 * can scrape — and on a *.vercel.app deployment the most name-shaped thing
 * available is the host, which reads as Vercel.
 *
 * `short_name` is what appears under the home-screen icon and what gets
 * truncated first, so it is the bare brand rather than the full tagline.
 */
export default function manifest(): WebManifest {
  return {
    // PINNED, and pinned to the value it ALREADY had.
    //
    // With no `id`, a browser identifies an installed app by its
    // start_url. That makes start_url load-bearing in a way nothing in the
    // code says: changing it would orphan every existing installation and
    // silently create a second app beside it. Declaring the id makes
    // start_url ordinary again — but it has to be declared as the CURRENT
    // implicit id, not as the tidier "/", or the act of adding it would
    // cause exactly the orphaning it exists to prevent.
    id: "/dashboard/overview",
    name: "Ionexa AI",
    short_name: "Ionexa",
    description:
      "Your business, organized — with AI that actually helps. Ideas, research, finance, trading and product planning in one workspace.",
    // The manifest's OWN strings, which are English. It is not the app's
    // language: the interface ships in ten locales and picks per user. A
    // manifest cannot be localised — there is one document per origin — so
    // this describes this document, and nothing else.
    lang: "en",
    dir: "ltr",
    start_url: "/dashboard/overview",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0a0a0a",
    theme_color: "#0a0a0a",
    categories: ["productivity", "business"],
    // A share or a double-clicked file goes to the window that is already
    // open, instead of starting a second copy of the app beside it.
    launch_handler: { client_mode: "navigate-existing" },
    // Long-press / jump-list entries on Android and desktop — the three
    // things a returning user actually opens.
    shortcuts: [
      { name: "Chat", short_name: "Chat", url: "/dashboard/chat" },
      { name: "Create", short_name: "Create", url: "/dashboard/create" },
      { name: "Overview", short_name: "Overview", url: "/dashboard/overview" },
    ],
    icons: [
      // Served by the Next.js file conventions in this same directory —
      // src/app/icon.svg and src/app/apple-icon.png.
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
      // THE TWO RASTER SIZES INSTALLABILITY ACTUALLY COUNTS.
      //
      // An SVG with sizes:"any" is legal and Chromium ignores it when
      // deciding whether a site can be installed; the audit that added
      // these found the manifest resting on `/apple-icon`, which 404s —
      // the file convention is apple-icon.PNG, so the served path has the
      // extension. One dead URL and one uncounted SVG is how a manifest
      // looks complete and installs nothing.
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/apple-icon.png", sizes: "180x180", type: "image/png", purpose: "any" },
      // A MASKABLE icon is what stops Android framing the logo in a white
      // circle: the launcher crops it to the device's own shape and needs
      // the safe zone that "any" icons do not promise.
      {
        src: "/icon-maskable.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    // Chrome shows a richer install dialog — one that previews the app —
    // only when the manifest carries screenshots with a form_factor, and
    // falls back to a one-line mini-infobar otherwise. These are
    // photographs of a real production build taken by
    // scripts/generate-pwa-assets.mjs, against an EMPTY account: they show
    // the app's real empty states rather than invented figures.
    screenshots: [
      { src: "/screenshots/narrow-overview.jpg", sizes: "1080x1920", type: "image/jpeg", form_factor: "narrow", label: "Your day at a glance" },
      { src: "/screenshots/narrow-chat.jpg", sizes: "1080x1920", type: "image/jpeg", form_factor: "narrow", label: "Ask anything about your business" },
      { src: "/screenshots/narrow-create.jpg", sizes: "1080x1920", type: "image/jpeg", form_factor: "narrow", label: "Describe it once — Ionexa builds it" },
      { src: "/screenshots/wide-overview.jpg", sizes: "1920x1080", type: "image/jpeg", form_factor: "wide", label: "One workspace for the whole business" },
      { src: "/screenshots/wide-agents.jpg", sizes: "1920x1080", type: "image/jpeg", form_factor: "wide", label: "Agents that keep working while you don't" },
    ],
    // "Share this CSV to Ionexa" from any app's share sheet.
    //
    // POST + multipart because that is the only enctype that can carry
    // FILES; a GET share target is limited to title/text/url. The handler
    // is a route, not a page — a page cannot receive a POST — and it
    // answers with a 303 so the browser turns the share into an ordinary
    // GET of wherever the content landed.
    share_target: {
      action: "/share",
      method: "POST",
      enctype: "multipart/form-data",
      params: {
        title: "title",
        text: "text",
        url: "url",
        files: [
          {
            name: "files",
            // The types the Files workspace can actually read. Offering
            // one it cannot would put Ionexa in the share sheet for files
            // it is about to refuse.
            accept: [
              "application/pdf",
              ".pdf",
              "text/csv",
              ".csv",
              "text/plain",
              ".txt",
              "text/markdown",
              ".md",
              ".markdown",
              "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
              ".docx",
              "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
              ".xlsx",
            ],
          },
        ],
      },
    },
    // Double-clicking one of these in the OS opens it in Ionexa.
    //
    // Same list as the share target, and for the same reason: this is a
    // promise to the operating system about what Ionexa can open, and the
    // Files workspace is what has to keep it.
    file_handlers: [
      {
        action: "/dashboard/files",
        accept: {
          "application/pdf": [".pdf"],
          "text/csv": [".csv"],
          "text/plain": [".txt"],
          "text/markdown": [".md", ".markdown"],
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
        },
        launch_type: "single-client",
      },
    ],
  };
}
