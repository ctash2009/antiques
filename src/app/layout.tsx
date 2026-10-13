import type { Metadata } from "next";
import Link from "next/link";
import Script from "next/script";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
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

// Set once you have the code from Google -- nothing renders until this is
// set, so leaving it unset is a safe no-op rather than a broken/empty tag.
const GOOGLE_SITE_VERIFICATION = process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION;
// Same deal for GA4 -- set NEXT_PUBLIC_GA_MEASUREMENT_ID once you have a
// Measurement ID (G-XXXXXXX) from analytics.google.com; the gtag script
// below only renders when it's present.
const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;

const siteUrl = getSiteUrl();

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Antique Stores Finder",
    template: "%s | Antique Stores Finder",
  },
  description:
    "Find antique stores, vintage dealers, and collectibles shops near you -- browse by state and city.",
  openGraph: {
    type: "website",
    siteName: "Antique Stores Finder",
    title: "Antique Stores Finder",
    description:
      "Find antique stores, vintage dealers, and collectibles shops near you -- browse by state and city.",
    url: siteUrl,
  },
  twitter: {
    card: "summary",
    title: "Antique Stores Finder",
    description:
      "Find antique stores, vintage dealers, and collectibles shops near you -- browse by state and city.",
  },
  ...(GOOGLE_SITE_VERIFICATION
    ? { verification: { google: GOOGLE_SITE_VERIFICATION } }
    : {}),
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
        <Analytics />
        <SpeedInsights />
        {GA_MEASUREMENT_ID && (
          <>
            <Script src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`} strategy="afterInteractive" />
            <Script id="ga4-init" strategy="afterInteractive">
              {`window.dataLayer = window.dataLayer || [];
                function gtag(){dataLayer.push(arguments);}
                gtag('js', new Date());
                gtag('config', '${GA_MEASUREMENT_ID}');`}
            </Script>
          </>
        )}
      </body>
    </html>
  );
}
