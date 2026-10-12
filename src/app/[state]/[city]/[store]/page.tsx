import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { parseStoreSlug, slugify, stateBySlug } from "@/lib/geo";
import { getStoreById } from "@/lib/stores";
import { breadcrumbJsonLd, storeJsonLd } from "@/lib/jsonld";
import { JsonLd } from "@/components/JsonLd";
import { getSiteUrl } from "@/lib/site";

// Listings are not prerendered at build time (34,928 of them) -- each
// renders on first visit and is cached for `revalidate` seconds (ISR).
// Enrichment data changes rarely once a store has been processed, so this
// is longer than the city page's.
export const revalidate = 86400;

type Props = { params: Promise<{ state: string; city: string; store: string }> };

async function resolve(params: Props["params"]) {
  const { state: stateSlug, city: citySlug, store: storeSlug } = await params;
  const state = stateBySlug(stateSlug);
  if (!state) return null;

  const id = parseStoreSlug(storeSlug);
  if (id === null) return null;

  const store = await getStoreById(id);
  if (!store || store.stateCode !== state.code) return null;

  return { state, citySlug, store };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const resolved = await resolve(params);
  if (!resolved) return {};
  const { state, store } = resolved;
  return {
    title: `${store.name} -- Antique Store in ${store.city}, ${state.code}`,
    description:
      store.enrichedDescription ??
      `${store.name} is an antique store in ${store.city}, ${state.name}. Find address, hours, and contact info.`,
  };
}

export default async function StorePage({ params }: Props) {
  const resolved = await resolve(params);
  if (!resolved) notFound();
  const { state, citySlug, store } = resolved;

  // Canonicalize: if the city segment in the URL doesn't match the store's
  // actual city slug (stale link, renamed city, etc.), redirect to the
  // correct URL instead of 404ing or silently rendering under a wrong path.
  const canonicalCitySlug = slugify(store.city);
  if (citySlug !== canonicalCitySlug) {
    redirect(`/${state.slug}/${canonicalCitySlug}/${store.slug}`);
  }

  const pageUrl = `${getSiteUrl()}/${state.slug}/${citySlug}/${store.slug}`;

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <JsonLd
        data={breadcrumbJsonLd([
          { name: "All States", path: "/" },
          { name: state.name, path: `/${state.slug}` },
          { name: store.city, path: `/${state.slug}/${citySlug}` },
          { name: store.name, path: `/${state.slug}/${citySlug}/${store.slug}` },
        ])}
      />
      <JsonLd data={storeJsonLd(store, pageUrl)} />

      <nav className="text-sm text-stone-500">
        <Link href="/" className="hover:underline">
          All States
        </Link>{" "}
        /{" "}
        <Link href={`/${state.slug}`} className="hover:underline">
          {state.name}
        </Link>{" "}
        /{" "}
        <Link href={`/${state.slug}/${citySlug}`} className="hover:underline">
          {store.city}
        </Link>
      </nav>

      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-stone-900">
        {store.name}
      </h1>
      <p className="mt-1 text-stone-600">
        {store.primarySpecialty || store.category || "Antique store"}
      </p>

      {store.enrichmentStatus === "insufficient_data" && (
        <div className="mt-4 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          We don&apos;t have verified details for this listing yet. If you know
          this store, let us know what we&apos;re missing.
        </div>
      )}

      {store.rating !== null && (
        <p className="mt-3 text-sm text-stone-700">
          <span className="font-medium">{store.rating.toFixed(1)} ★</span>
          {store.reviews !== null && (
            <span className="text-stone-400"> ({store.reviews} reviews)</span>
          )}
        </p>
      )}

      {(store.enrichedDescription || store.description) && (
        <p className="mt-6 leading-relaxed text-stone-700">
          {store.enrichedDescription ?? store.description}
        </p>
      )}

      <dl className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {store.address && (
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-stone-400">
              Address
            </dt>
            <dd className="mt-1 text-stone-800">{store.address}</dd>
          </div>
        )}
        {store.phone && (
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-stone-400">
              Phone
            </dt>
            <dd className="mt-1 text-stone-800">
              <a href={`tel:${store.phone}`} className="hover:underline">
                {store.phone}
              </a>
            </dd>
          </div>
        )}
        {store.website && (
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-stone-400">
              Website
            </dt>
            <dd className="mt-1 text-stone-800">
              <a
                href={store.website}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="hover:underline"
              >
                {store.website}
              </a>
            </dd>
          </div>
        )}
        {store.buysAntiques !== null && (
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-stone-400">
              Buys Antiques
            </dt>
            <dd className="mt-1 text-stone-800">
              {store.buysAntiques ? "Yes" : "No"}
              {store.buyingModel && store.buyingModel !== "unclear" && (
                <span className="text-stone-500"> -- {store.buyingModel.replace(/_/g, " ")}</span>
              )}
            </dd>
          </div>
        )}
      </dl>

      {store.workingHours && (
        <div className="mt-8">
          <h2 className="text-xs font-medium uppercase tracking-wide text-stone-400">
            Hours
          </h2>
          <dl className="mt-2 grid max-w-sm grid-cols-2 gap-y-1 text-sm text-stone-700">
            {Object.entries(store.workingHours).map(([day, hours]) => (
              <div key={day} className="contents">
                <dt className="text-stone-500">{day}</dt>
                <dd>{(hours as string[]).join(", ")}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-2 text-xs text-stone-400">
            Hours may change -- please call ahead to confirm.
          </p>
        </div>
      )}
    </div>
  );
}
