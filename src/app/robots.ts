import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/lib/site";
import { getSitemapChunkCount } from "@/lib/sitemap-chunks";

export const revalidate = 3600;

export default async function robots(): Promise<MetadataRoute.Robots> {
  const base = getSiteUrl();
  const chunkCount = await getSitemapChunkCount();
  // Next's generateSitemaps produces /sitemap/0.xml, /sitemap/1.xml, etc
  // with no automatic index at a bare /sitemap.xml -- list every real
  // chunk URL directly rather than pointing at a path nothing serves.
  const sitemaps = Array.from({ length: chunkCount }, (_, i) => `${base}/sitemap/${i}.xml`);

  return {
    rules: { userAgent: "*", allow: "/" },
    sitemap: sitemaps,
  };
}
