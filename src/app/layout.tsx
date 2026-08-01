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

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"),
  title: {
    default: "Ionexa AI — The energy behind everything you build.",
    template: "%s — Ionexa AI",
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
