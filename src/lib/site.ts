// No production domain is chosen yet. Set NEXT_PUBLIC_SITE_URL once one is
// -- everything that builds absolute URLs (JSON-LD, sitemap, canonical tags)
// reads from here so there's a single place to update.
export function getSiteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
}

// JSON.stringify doesn't escape "<", so untrusted text (store names are
// scraped, not authored) landing in a JSON-LD <script> tag could break out
// of it with a literal "</script>". Escaping to the unicode form keeps the
// JSON valid while making that impossible.
export function jsonLdScript(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
