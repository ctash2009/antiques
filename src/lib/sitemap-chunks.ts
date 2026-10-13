import { getTotalStoreCount } from "./stores";

// Shared between app/sitemap.ts (which generates the chunks) and
// app/robots.ts (which must list every chunk's real URL -- Next's
// generateSitemaps produces /sitemap/0.xml, /sitemap/1.xml, etc, with NO
// automatic index at the bare /sitemap.xml. Pointing robots.txt at
// /sitemap.xml was a real bug: that path 404s/hangs since nothing serves
// it. One source of truth for the chunk count so the two files can't
// drift out of sync as the catalog grows.
export const LISTINGS_PER_CHUNK = 40000;

// Chunk 0 is geo pages (home + states + cities); chunks 1..N are listing
// pages. Total chunk count, matching generateSitemaps()'s array length.
export async function getSitemapChunkCount(): Promise<number> {
  const total = await getTotalStoreCount();
  const listingChunks = Math.max(1, Math.ceil(total / LISTINGS_PER_CHUNK));
  return listingChunks + 1;
}
