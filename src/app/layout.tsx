import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import { getSiteUrl } from "@/lib/site";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(getSiteUrl()),
  title: {
    default: "Antique Directory",
    template: "%s | Antique Directory",
  },
  description:
    "Find antique stores, vintage dealers, and collectibles shops near you -- browse by state and city.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-stone-50 text-stone-900">
        <header className="border-b border-stone-200 bg-white">
          <div className="mx-auto max-w-5xl px-4 py-4">
            <Link href="/" className="text-lg font-semibold tracking-tight">
              Antique Directory
            </Link>
          </div>
        </header>
        <main className="flex-1">{children}</main>
        <footer className="border-t border-stone-200 bg-white">
          <div className="mx-auto max-w-5xl px-4 py-6 text-sm text-stone-500">
            Antique Directory -- store listings sourced and enriched from public
            data. Information may be incomplete or out of date; verify hours and
            availability with the store directly.
          </div>
        </footer>
      </body>
    </html>
  );
}
