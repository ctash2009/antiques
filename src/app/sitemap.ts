import type { MetadataRoute } from "next";
import { STATES, slugify } from "@/lib/geo";
import { getAllCities, getAllStoreSlugs } from "@/lib/stores";
import { getSiteUrl } from "@/lib/site";
import { getSitemapChunkCount, LISTINGS_PER_CHUNK } from "@/lib/sitemap-chunks";

// Chunk id 0 carries home + all state pages + all city pages (~9,821 URLs
// today -- well under the 50k/file limit on its own). Remaining ids are
// listing pages in fixed-size pages, computed from the live count so this
// keeps working as the catalog grows. Chunk count logic lives in
// sitemap-chunks.ts, shared with robots.ts.
export async function generateSitemaps() {
  const chunkCount = await getSitemapChunkCount();
  return Array.from({ length: chunkCount }, (_, i) => ({ id: i }));
}

export default async function sitemap({
  id,
}: {
  id: Promise<string>;
}): Promise<MetadataRoute.Sitemap> {
  const chunk = Number(await id);
  const base = getSiteUrl();

  if (chunk === 0) {
    const cities = await getAllCities();
    const stateEntries: MetadataRoute.Sitemap = STATES.map((s) => ({
      url: `${base}/${s.slug}`,
      changeFrequency: "weekly",
    }));
    const cityEntries: MetadataRoute.Sitemap = cities.map((c) => ({
      url: `${base}/${STATES.find((s) => s.code === c.stateCode)?.slug ?? c.stateCode.toLowerCase()}/${slugify(c.city)}`,
      changeFrequency: "weekly",
    }));
    return [
      { url: base, changeFrequency: "weekly", priority: 1 },
      ...stateEntries,
      ...cityEntries,
    ];
  }

  const offset = (chunk - 1) * LISTINGS_PER_CHUNK;
  const slugs = await getAllStoreSlugs({ offset, limit: LISTINGS_PER_CHUNK });
  return slugs.map((s) => {
    const state = STATES.find((st) => st.code === s.stateCode);
    const stateSlug = state?.slug ?? s.stateCode.toLowerCase();
    return {
      url: `${base}/${stateSlug}/${slugify(s.city)}/${slugify(s.name)}-${s.id}`,
      lastModified: s.updatedAt,
      changeFrequency: "monthly",
    };
  });
}
