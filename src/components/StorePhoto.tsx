"use client";

import { useState } from "react";

// Google's scraped photo URLs (lh3.googleusercontent.com, streetviewpixels)
// aren't durable -- they're signed/session-scoped and expire over time
// independent of anything in our code. Confirmed 2026-10-14: every photo
// URL in the catalog now 403s. Rather than show a browser's ugly broken-
// image icon when that happens, fall back to the same clean placeholder
// used when there's no photo URL at all. This is a UX patch, not a fix --
// see [[photo_hosting]] memory for the real fix (self-hosting).
export function StorePhoto({
  src,
  alt,
  variant = "hero",
}: {
  src: string;
  alt: string;
  variant?: "hero" | "thumb";
}) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return variant === "hero" ? (
      <div
        style={{
          aspectRatio: "16/7",
          borderRadius: "var(--radius-card)",
          border: "1px solid var(--color-border)",
          background: "var(--color-primary-soft)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--color-text-muted)",
          fontSize: "14px",
        }}
      >
        Photo unavailable
      </div>
    ) : (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4">
        <path d="M4 18V9a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v9M4 18h16M4 18v2M20 18v2M7 7V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v2" />
      </svg>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- external Google Business Profile photo, not an optimizable local asset
    <img
      src={src}
      alt={alt}
      onError={() => setFailed(true)}
      style={
        variant === "hero"
          ? {
              width: "100%",
              aspectRatio: "4/3",
              objectFit: "cover",
              borderRadius: "var(--radius-card)",
              border: "1px solid var(--color-border)",
            }
          : undefined
      }
    />
  );
}
