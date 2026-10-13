import type { Metadata } from "next";
import Link from "next/link";
import { Fraunces, Public_Sans } from "next/font/google";
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
      className={`${fraunces.variable} ${publicSans.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <div className="topbar">
          <div
            className="mx-auto flex items-center justify-between gap-4 px-4 py-4"
            style={{ maxWidth: "var(--content-max)" }}
          >
            <Link href="/" className="wordmark">
              Antique Stores <span>Finder</span>
            </Link>
            <nav className="topbar-nav">
              <Link href="/search">Find Shops</Link>
              <Link href="/search?buys=outright">Find Buyers</Link>
              <Link href="/#states">Browse States</Link>
            </nav>
          </div>
        </div>
        <main className="flex-1">{children}</main>
        <footer className="sitefoot">
          <div
            className="mx-auto px-4 py-6 text-sm"
            style={{ maxWidth: "var(--content-max)", color: "var(--color-text-muted)" }}
          >
            Antique Stores Finder -- store listings sourced and enriched from
            public data. Information may be incomplete or out of date; verify
            hours and availability with the store directly.
          </div>
        </footer>
      </body>
    </html>
  );
}
