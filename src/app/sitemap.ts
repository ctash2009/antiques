import type { MetadataRoute } from "next";
import { STATES, stateByCode, slugify, storeSlug } from "@/lib/geo";
import { getAllCities, getAllStoreSlugs } from "@/lib/stores";
import { getSiteUrl } from "@/lib/site";

// One file: states + cities + listings comes to ~45K URLs for the current
// dataset, under the 50K/file limit Next (and Google) enforce. If the
// dataset grows past that, split this into generateSitemaps() shards.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const siteUrl = getSiteUrl();
  const [cities, listings] = await Promise.all([getAllCities(), getAllStoreSlugs()]);

  const stateEntries: MetadataRoute.Sitemap = STATES.map((s) => ({
    url: `${siteUrl}/${s.slug}`,
    changeFrequency: "weekly",
    priority: 0.8,
  }));

  const cityEntries: MetadataRoute.Sitemap = cities.flatMap(({ stateCode, city }) => {
    const state = stateByCode(stateCode);
    if (!state) return [];
    return [
      {
        url: `${siteUrl}/${state.slug}/${slugify(city)}`,
        changeFrequency: "weekly",
        priority: 0.6,
      },
    ];
  });

  const listingEntries: MetadataRoute.Sitemap = listings.flatMap((store) => {
    const state = stateByCode(store.stateCode);
    if (!state) return [];
    return [
      {
        url: `${siteUrl}/${state.slug}/${slugify(store.city)}/${storeSlug(store.name, store.id)}`,
        lastModified: store.updatedAt,
        changeFrequency: "monthly",
        priority: 0.4,
      },
    ];
  });

  return [
    { url: siteUrl, changeFrequency: "daily", priority: 1 },
    ...stateEntries,
    ...cityEntries,
    ...listingEntries,
  ];
}
