import type { Metadata } from "next";
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

// TEMPORARY diagnostic marker (see this pass's PR/commit description) —
// the user reported the live production tab title doesn't show "Ionexa
// AI" as expected, and this sandbox cannot reach the live production URL
// to verify directly (confirmed blocked — HTTPS_PROXY policy denial and
// WebFetch 403, 3 separate attempts). This unique suffix on the DEFAULT
// title lets the user check the live tab title after this commit
// deploys and report back exactly what they see, which tells us whether
// (a) the code never actually reaches production (cache/deployment
// issue — this marker also won't show), or (b) it does reach production
// and "Ionexa AI" is genuinely correct there (marker shows). REMOVE this
// suffix once that's confirmed — it's not meant to ship long-term.
const TITLE_TEST_MARKER = " [TITLE-TEST-40217]";

export const metadata: Metadata = {
  metadataBase: new URL(getSiteUrl()),
  title: {
    default: `Ionexa AI — The energy behind everything you build.${TITLE_TEST_MARKER}`,
    template: `%s — Ionexa AI${TITLE_TEST_MARKER}`,
  },
  description:
    "Create anything with AI. From ideas and research to trading, finance, product planning and business decisions — organized in one intelligent workspace.",
};

// Sets data-theme and the three accessibility data-* attributes on <html>
// before first paint, straight from localStorage, so there's no flash of
// the wrong theme/font-size/contrast between the server-rendered (always
// default) HTML and hydration. Each preference defaults to "off"/base
// whenever nothing is stored yet, except reduce-motion, which also falls
// back to the OS-level prefers-reduced-motion query so motion-sensitive
// users are covered even before they find the toggle in Settings.
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
if(rmOn){document.documentElement.setAttribute('data-motion','reduce');}
}catch(e){}})();`;

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html lang={locale} className="h-full" suppressHydrationWarning>
      <head>
        {/* eslint-disable-next-line react/no-danger */}
        <script dangerouslySetInnerHTML={{ __html: INIT_SCRIPT }} />
      </head>
      <body className="min-h-full bg-background text-foreground antialiased" suppressHydrationWarning>
        <NextIntlClientProvider locale={locale} messages={messages}>
          {children}
          <GlobalControls />
          <CookieConsentBanner />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
