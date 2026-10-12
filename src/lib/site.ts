// No production domain is chosen yet. Set NEXT_PUBLIC_SITE_URL once one is
// -- it's needed for correct absolute URLs in JSON-LD, the sitemap, and
// canonical tags. Falls back to localhost so dev/build don't break.
export function getSiteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
}
