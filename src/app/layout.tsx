import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI OS",
  description: "AI OS — your operating system for ideas, execution, and growth.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-full bg-background text-foreground antialiased">
        {children}
      </body>
    </html>
  );
}
