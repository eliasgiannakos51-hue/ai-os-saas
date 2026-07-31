import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import "./globals.css";
import { GlobalControls } from "@/components/global-controls";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"),
  title: {
    default: "Ionexa AI — The energy behind everything you build.",
    template: "%s — Ionexa AI",
  },
  description:
    "Create anything with AI. From ideas and research to trading, finance, product planning and business decisions — organized in one intelligent workspace.",
};

// Sets data-theme on <html> before first paint, straight from
// localStorage, so there's no flash of the wrong theme between the
// server-rendered (always dark-by-default) HTML and hydration. Defaults
// to dark whenever nothing is stored yet, matching the pre-toggle
// behavior exactly. theme-toggle.tsx is the only other place this value
// is written.
const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem('theme');document.documentElement.setAttribute('data-theme',t==='light'?'light':'dark');}catch(e){}})();`;

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
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-full bg-background text-foreground antialiased" suppressHydrationWarning>
        <NextIntlClientProvider locale={locale} messages={messages}>
          {children}
          <GlobalControls />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
