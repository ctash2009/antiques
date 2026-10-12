import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { parseStoreSlug, slugify, stateBySlug } from "@/lib/geo";
import { getStoreById } from "@/lib/stores";
import { parseOpeningHours, formatWeeklyHours } from "@/lib/hours";
import { getSiteUrl, jsonLdScript } from "@/lib/site";

export const revalidate = 86400; // enrichment data changes rarely

type Props = { params: Promise<{ state: string; city: string; store: string }> };

async function resolve(params: Awaited<Props["params"]>) {
  const state = stateBySlug(params.state);
  if (!state) return null;

  const id = parseStoreSlug(params.store);
  if (id === null) return null;

  const detail = await getStoreById(id);
  if (!detail) return null;

  // The store must actually belong to the state/city in the URL -- a
  // matching id with the wrong geo segments means a stale or spoofed link.
  if (detail.stateCode !== state.code) return null;
  if (slugify(detail.city) !== params.city) return null;

  return { state, detail };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const resolved = await resolve(await params);
  if (!resolved) return {};
  const { state, detail } = resolved;
  const title = `${detail.name} -- Antique Store in ${detail.city}, ${state.code}`;
  const description =
    detail.enrichedDescription ??
    `${detail.name} is an antique store in ${detail.city}, ${state.name}.${
      detail.primarySpecialty ? ` Specializing in ${detail.primarySpecialty}.` : ""
    }`;
  return { title, description };
}

export default async function StorePage({ params }: Props) {
  const awaitedParams = await params;
  const resolved = await resolve(awaitedParams);
  if (!resolved) notFound();
  const { state, detail } = resolved;

  // Canonicalize: if the name changed since the slug was generated (or
  // someone linked an old slug), redirect to the current correct URL rather
  // than serving duplicate content under two slugs for the same id.
  if (awaitedParams.store !== detail.slug) {
    redirect(`/${state.slug}/${slugify(detail.city)}/${detail.slug}`);
  }

  const citySlug = slugify(detail.city);
  const siteUrl = getSiteUrl();
  const pageUrl = `${siteUrl}/${state.slug}/${citySlug}/${detail.slug}`;
  const weeklyHours = formatWeeklyHours(detail.workingHours);
  const openingHoursSpec = parseOpeningHours(detail.workingHours);

  const jsonLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "AntiqueStore",
    "@id": pageUrl,
    name: detail.name,
    url: pageUrl,
    address: {
      "@type": "PostalAddress",
      streetAddress: detail.street ?? undefined,
      addressLocality: detail.city,
      addressRegion: state.code,
      postalCode: detail.postalCode ?? undefined,
      addressCountry: "US",
    },
  };
  if (detail.phone) jsonLd.telephone = detail.phone;
  if (detail.website) jsonLd.sameAs = detail.website;
  if (detail.photo) jsonLd.image = detail.photo;
  if (detail.latitude !== null && detail.longitude !== null) {
    jsonLd.geo = {
      "@type": "GeoCoordinates",
      latitude: detail.latitude,
      longitude: detail.longitude,
    };
  }
  if (detail.rating !== null && detail.reviews) {
    jsonLd.aggregateRating = {
      "@type": "AggregateRating",
      ratingValue: detail.rating,
      reviewCount: detail.reviews,
    };
  }
  if (openingHoursSpec.length > 0) {
    jsonLd.openingHoursSpecification = openingHoursSpec;
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(jsonLd) }}
      />
      <nav className="flex flex-wrap gap-2 text-sm text-stone-500">
        <Link href="/" className="hover:underline">
          All States
        </Link>
        <span>/</span>
        <Link href={`/${state.slug}`} className="hover:underline">
          {state.name}
        </Link>
        <span>/</span>
        <Link href={`/${state.slug}/${citySlug}`} className="hover:underline">
          {detail.city}
        </Link>
      </nav>

      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-stone-900">
        {detail.name}
      </h1>
      <p className="mt-1 text-stone-600">
        {detail.city}, {state.name}
        {detail.rating !== null && (
          <>
            {" "}
            &middot; ★ {detail.rating.toFixed(1)}
            {detail.reviews ? ` (${detail.reviews} reviews)` : ""}
          </>
        )}
      </p>

      {detail.enrichmentStatus !== "enriched" && (
        <p className="mt-4 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          This is a basic listing -- we haven&apos;t yet verified details for this
          store beyond what&apos;s publicly indexed.
        </p>
      )}

      {detail.primarySpecialty && (
        <p className="mt-4 text-sm font-medium tracking-wide text-amber-800 uppercase">
          {detail.primarySpecialty}
        </p>
      )}

      {detail.enrichedDescription ?? detail.description ? (
        <p className="mt-3 text-stone-700">
          {detail.enrichedDescription ?? detail.description}
        </p>
      ) : null}

      <dl className="mt-6 grid grid-cols-1 gap-3 border-t border-stone-200 pt-6 sm:grid-cols-2">
        {detail.address && (
          <div>
            <dt className="text-xs text-stone-500">Address</dt>
            <dd className="text-stone-800">{detail.address}</dd>
          </div>
        )}
        {detail.phone && (
          <div>
            <dt className="text-xs text-stone-500">Phone</dt>
            <dd className="text-stone-800">
              <a href={`tel:${detail.phone}`} className="hover:underline">
                {detail.phone}
              </a>
            </dd>
          </div>
        )}
        {detail.website && (
          <div>
            <dt className="text-xs text-stone-500">Website</dt>
            <dd className="text-stone-800">
              <a
                href={detail.website}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="hover:underline"
              >
                {detail.website.replace(/^https?:\/\//, "")}
              </a>
            </dd>
          </div>
        )}
        {detail.buyingModel && detail.buyingModel !== "unclear" && (
          <div>
            <dt className="text-xs text-stone-500">Buys antiques</dt>
            <dd className="text-stone-800">
              {detail.buysAntiques ? "Yes" : "No"} ({detail.buyingModel.replace(/_/g, " ")})
            </dd>
          </div>
        )}
      </dl>

      {weeklyHours.length > 0 && (
        <div className="mt-6 border-t border-stone-200 pt-6">
          <h2 className="text-sm font-medium text-stone-900">Hours</h2>
          <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            {weeklyHours.map(({ day, hours }) => (
              <div key={day} className="contents">
                <dt className="text-stone-500">{day}</dt>
                <dd className="text-stone-800">{hours}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </div>
  );
}
