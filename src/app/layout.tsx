import type { Metadata, Viewport } from "next";
import { Instrument_Sans, JetBrains_Mono } from "next/font/google";
import { SiteHeader } from "@/components/site-header";
import { ToastProvider } from "@/components/toast";
import "./globals.css";

const instrument = Instrument_Sans({ subsets: ["latin"], variable: "--font-instrument", axes: ["wdth"] });
const jetbrains = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains" });

export const metadata: Metadata = {
  title: { default: "Ensemble: set up AI coding tools, run AI teams", template: "%s · Ensemble" },
  description: "Generate CLAUDE.md, AGENTS.md, Cursor rules and safe permissions with every line explained, then run teams of AI agents across providers.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F5F2EA" },
    { media: "(prefers-color-scheme: dark)", color: "#15140F" },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${instrument.variable} ${jetbrains.variable}`}>
      <body>
        <ToastProvider>
          <a href="#main" className="sr focus:not-sr-only">Skip to content</a>
          <SiteHeader />
          <main id="main">{children}</main>
        </ToastProvider>
      </body>
    </html>
  );
}
