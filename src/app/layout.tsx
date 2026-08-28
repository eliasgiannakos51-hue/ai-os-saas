import type { Metadata, Viewport } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import "./globals.css";
import { GlobalControls } from "@/components/global-controls";
import { CookieConsentBanner } from "@/components/cookie-consent-banner";
import {
  FONT_SIZE_STORAGE_KEY,
  HIGH_CONTRAST_STORAGE_KEY,
  REDUCE_MOTION_STORAGE_KEY,
} from "@/lib/accessibility-prefs";
import { getSiteUrl } from "@/lib/site-url";

const SITE_DESCRIPTION =
  "Create anything with AI. From ideas and research to trading, finance, product planning and business decisions — organized in one intelligent workspace.";

export const metadata: Metadata = {
  metadataBase: new URL(getSiteUrl()),
  title: {
    default: "Ionexa AI — The energy behind everything you build.",
    template: "%s — Ionexa AI",
  },
  description: SITE_DESCRIPTION,
  applicationName: "Ionexa AI",
  // What Safari puts under the icon when the site is added to the home
  // screen. Without it — and without the manifest in app/manifest.ts —
  // the browser falls back to scraping the host, which on a *.vercel.app
  // deployment reads as "Vercel". That fallback is the reported bug; both
  // of these together are what override it.
  appleWebApp: {
    capable: true,
    title: "Ionexa AI",
    statusBarStyle: "black-translucent",
  },
  // siteName is what a browser, a share sheet and every social preview
  // use to name the site itself, as opposed to naming the page.
  openGraph: {
    type: "website",
    siteName: "Ionexa AI",
    title: "Ionexa AI — The energy behind everything you build.",
    description: SITE_DESCRIPTION,
    url: "/",
  },
  twitter: {
    card: "summary_large_image",
    title: "Ionexa AI — The energy behind everything you build.",
    description: SITE_DESCRIPTION,
  },
};

// Colours the browser chrome on mobile to match the app's own background,
// so the status bar doesn't sit as a white band above a black page.
export const viewport: Viewport = {
  themeColor: "#0a0a0a",
  colorScheme: "dark light",
  width: "device-width",
  initialScale: 1,
};

// Sets data-theme and the three accessibility data-* attributes on <html>
// before first paint, straight from localStorage, so there's no flash of
// the wrong theme/font-size/contrast between the server-rendered (always
// default) HTML and hydration. Each preference defaults to "off"/base
// whenever nothing is stored yet, except reduce-motion, which also falls
// back to the OS-level prefers-reduced-motion query so motion-sensitive
// users are covered even before they find the toggle in Settings.
// data-motion is written in BOTH directions ("reduce" / "full") rather
// than only when reducing, because globals.css needs to tell "the user
// explicitly asked for motion" apart from "this page has no JS yet" —
// see the prefers-reduced-motion media query there, which is the
// JS-free floor and must not override an explicit opt-in.
// theme-toggle.tsx and accessibility-settings.tsx are the only other
// places these values are written.
const INIT_SCRIPT = `(function(){try{
var t=localStorage.getItem('theme');
document.documentElement.setAttribute('data-theme',(t==='light'||t==='midnight'||t==='carbon')?t:'dark');
var fs=localStorage.getItem('${FONT_SIZE_STORAGE_KEY}');
document.documentElement.setAttribute('data-font-size',(fs==='small'||fs==='large'||fs==='xl')?fs:'medium');
if(localStorage.getItem('${HIGH_CONTRAST_STORAGE_KEY}')==='1'){document.documentElement.setAttribute('data-contrast','high');}
var rm=localStorage.getItem('${REDUCE_MOTION_STORAGE_KEY}');
var rmOn=rm==='1'||(rm===null&&window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches);
document.documentElement.setAttribute('data-motion',rmOn?'reduce':'full');
}catch(e){}})();`;

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  const messages = await getMessages();

  // THE WHOLE CATALOGUE, ON EVERY PAGE, AND THIS IS A REVERT.
  //
  // It shipped trimmed for one deploy and broke every dashboard page:
  // the sidebar rendered `sidebar.items.home`, `sidebar.groups.workspace`
  // and eight more as raw keys.
  //
  // THE REASON IT CANNOT BE DONE HERE. This is the ROOT layout, and in
  // the App Router a shared layout is rendered once and REUSED across
  // client-side navigations beneath it. A visitor lands on /login — a
  // marketing path, so the provider is built with five namespaces — signs
  // in, and Next.js navigates to /dashboard/overview WITHOUT re-rendering
  // this file. The dashboard's client components then look up `sidebar.*`
  // in a payload that never had it.
  //
  // So the pathname is the wrong input at the wrong level: no value read
  // here can vary per child route, because this component does not run
  // again when the child changes. Splitting the payload needs a layout
  // per route group, each with its own provider — not a header.
  //
  // The measurement that motivated it stands: a Greek public page carries
  // 93% of a catalogue it never reads. lib/i18n/marketing-messages.ts and
  // its gate are kept as the record of what is safe to send, and the gate
  // now asserts THIS line — the full object — so the trimmed version
  // cannot come back without the layout split that makes it correct.
  const clientMessages = messages;

  return (
    <html lang={locale} className="h-full" suppressHydrationWarning>
      <head>
        {/* eslint-disable-next-line react/no-danger */}
        <script dangerouslySetInnerHTML={{ __html: INIT_SCRIPT }} />
      </head>
      <body className="min-h-full bg-background text-foreground antialiased" suppressHydrationWarning>
        <NextIntlClientProvider locale={locale} messages={clientMessages}>
          {children}
          <GlobalControls />
          <CookieConsentBanner />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
