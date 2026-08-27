import type { Metadata, Viewport } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import { headers } from "next/headers";
import { isMarketingPath, pickNamespaces } from "@/lib/i18n/marketing-messages";
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

  // HOW MUCH OF THE CATALOGUE THIS PAGE ACTUALLY NEEDS.
  //
  // `messages` is all 2,659 keys, and NextIntlClientProvider serialises
  // whatever it is given into the HTML. Measured on the live home page:
  // 209,715 characters, the catalogue starting at 57,710 — 72% of the
  // document. In Greek, the largest catalogue and the primary market, the
  // same page is 303,706 characters against English's 210,565.
  //
  // Public pages use five namespaces of the forty. Which five is derived
  // rather than declared: scripts/tests/marketing-messages.test.mjs walks
  // the import graph from every public entry point and fails if a client
  // component reachable from one asks for anything else — or asks in a
  // way no static list can bound, like useTranslations() with no
  // namespace or a computed key.
  //
  // FAIL-SAFE WHEN THE PATH IS UNKNOWN. If the middleware did not run,
  // there is no header and this sends everything. A page that is heavier
  // than it needed to be is a cost; a page missing a string is a bug in
  // front of a stranger.
  //
  // SERVER STRINGS ARE UNAFFECTED. getTranslations() reads the request's
  // own messages and never touches this provider, so nothing rendered on
  // the server can lose a word to this.
  const pathname = headers().get("x-pathname");
  const clientMessages =
    pathname && isMarketingPath(pathname) ? pickNamespaces(messages) : messages;

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
