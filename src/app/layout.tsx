import type { Metadata } from "next";
import Link from "next/link";
import { Fraunces, Public_Sans, IBM_Plex_Mono } from "next/font/google";
import { getSiteUrl } from "@/lib/site";
import "./globals.css";

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  axes: ["opsz"],
});

const publicSans = Public_Sans({
  variable: "--font-public-sans",
  subsets: ["latin"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  metadataBase: new URL(getSiteUrl()),
  title: {
    default: "Antique Stores Finder",
    template: "%s | Antique Stores Finder",
  },
  description:
    "Find antique stores, vintage dealers, and collectibles shops near you -- browse by state and city.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${fraunces.variable} ${publicSans.variable} ${plexMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <div className="topbar">
          <div className="mx-auto max-w-5xl px-4 py-4">
            <Link href="/" className="wordmark">
              Antique Stores <span>Finder</span>
            </Link>
          </div>
        </div>
        <main className="flex-1">{children}</main>
        <footer style={{ borderTop: "1px solid var(--line)", background: "var(--paper)" }}>
          <div className="mx-auto max-w-5xl px-4 py-6 text-sm" style={{ color: "var(--ink-faint)" }}>
            Antique Stores Finder -- store listings sourced and enriched from
            public data. Information may be incomplete or out of date; verify
            hours and availability with the store directly.
          </div>
        </footer>
      </body>
    </html>
  );
}
