import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { stateBySlug } from "@/lib/geo";
import { getStoresForCity } from "@/lib/stores";
import { getSiteUrl, jsonLdScript } from "@/lib/site";

export const revalidate = 3600;

type Props = { params: Promise<{ state: string; city: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { state: stateSlug, city: citySlug } = await params;
  const state = stateBySlug(stateSlug);
  if (!state) return {};
  const result = await getStoresForCity(state.code, citySlug);
  if (!result) return {};
  return {
    title: `Antique Stores in ${result.cityName}, ${state.code}`,
    description: `Find antique shops, vintage dealers, and collectibles stores near you in ${result.cityName}, ${state.name}. ${result.stores.length} listed.`,
  };
}

export default async function CityPage({ params }: Props) {
  const { state: stateSlug, city: citySlug } = await params;
  const state = stateBySlug(stateSlug);
  if (!state) notFound();

  const result = await getStoresForCity(state.code, citySlug);
  if (!result) notFound();
  const { cityName, stores } = result;

  const siteUrl = getSiteUrl();
  const pageUrl = `${siteUrl}/${state.slug}/${citySlug}`;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: `Antique Stores in ${cityName}, ${state.code}`,
    url: pageUrl,
    numberOfItems: stores.length,
    itemListElement: stores.map((s, i) => ({
      "@type": "ListItem",
      position: i + 1,
      url: `${siteUrl}/${state.slug}/${citySlug}/${s.slug}`,
      item: {
        "@type": "AntiqueStore",
        name: s.name,
        address: {
          "@type": "PostalAddress",
          addressLocality: cityName,
          addressRegion: state.code,
          addressCountry: "US",
        },
      },
    })),
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(jsonLd) }}
      />
      <nav className="flex gap-2 text-sm text-stone-500">
        <Link href="/" className="hover:underline">
          All States
        </Link>
        <span>/</span>
        <Link href={`/${state.slug}`} className="hover:underline">
          {state.name}
        </Link>
      </nav>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-stone-900">
        Antique Stores in {cityName}, {state.code}
      </h1>
      <p className="mt-2 text-stone-600">
        {stores.length.toLocaleString()} {stores.length === 1 ? "store" : "stores"} found
        near you in {cityName}.
      </p>

      <ul className="mt-8 grid gap-4 sm:grid-cols-2">
        {stores.map((s) => (
          <li key={s.id}>
            <Link
              href={`/${state.slug}/${citySlug}/${s.slug}`}
              className="block rounded-lg border border-stone-200 bg-white p-4 hover:border-stone-300 hover:shadow-sm"
            >
              <div className="flex items-start justify-between gap-2">
                <h2 className="font-medium text-stone-900">{s.name}</h2>
                {s.rating !== null && (
                  <span className="shrink-0 text-sm text-stone-500">
                    ★ {s.rating.toFixed(1)}
                    {s.reviews ? ` (${s.reviews})` : ""}
                  </span>
                )}
              </div>
              {s.primarySpecialty ? (
                <p className="mt-1 text-sm text-stone-600 line-clamp-2">
                  {s.primarySpecialty}
                </p>
              ) : s.category ? (
                <p className="mt-1 text-sm text-stone-500">{s.category}</p>
              ) : null}
              {s.enrichmentStatus !== "enriched" && (
                <p className="mt-2 text-xs text-amber-700">
                  Basic listing -- details not yet verified
                </p>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
