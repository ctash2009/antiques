import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { stateBySlug } from "@/lib/geo";
import { getStoresForCity } from "@/lib/stores";
import { breadcrumbJsonLd, storeListJsonLd } from "@/lib/jsonld";
import { JsonLd } from "@/components/JsonLd";
import { ResultRow } from "@/components/ResultRow";
import { EmptyState } from "@/components/EmptyState";

// Cities are not prerendered at build time (9,769 state+city combinations
// is too many for build-time generation to be practical) -- each one is
// rendered on first visit and cached for `revalidate` seconds (ISR).
export const revalidate = 3600;

type Props = {
  params: Promise<{ state: string; city: string }>;
  searchParams: Promise<{ buys?: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { state: stateSlug, city: citySlug } = await params;
  const state = stateBySlug(stateSlug);
  if (!state) return {};
  const result = await getStoresForCity(state.code, citySlug);
  if (!result) return {};
  return {
    title: `Antique Stores in ${result.cityName}, ${state.code}`,
    description: `Find antique shops and vintage dealers in ${result.cityName}, ${state.name}. ${result.stores.length} verified stores listed.`,
  };
}

export default async function CityPage({ params, searchParams }: Props) {
  const { state: stateSlug, city: citySlug } = await params;
  const { buys } = await searchParams;
  const state = stateBySlug(stateSlug);
  if (!state) notFound();

  const result = await getStoresForCity(state.code, citySlug);
  if (!result) notFound();
  const { cityName, stores: allStores } = result;

  const buysOnly = buys === "1" || buys === "outright";
  const stores = buysOnly ? allStores.filter((s) => s.buysAntiques === true) : allStores;

  return (
    <div className="mx-auto max-w-5xl px-4 py-10" style={{ maxWidth: "var(--content-max)" }}>
      <JsonLd
        data={breadcrumbJsonLd([
          { name: "All States", path: "/" },
          { name: state.name, path: `/${state.slug}` },
          { name: cityName, path: `/${state.slug}/${citySlug}` },
        ])}
      />
      <JsonLd data={storeListJsonLd(stores, cityName, state.code)} />

      <nav className="breadcrumb">
        <Link href="/">All States</Link>
        <span className="sep">/</span>
        <Link href={`/${state.slug}`}>{state.name}</Link>
      </nav>
      <h1 className="mt-2" style={{ fontSize: "clamp(2rem, 4vw, 2.9rem)", fontWeight: 600 }}>
        Antique Stores in {cityName}, {state.code}
      </h1>
      <p className="mt-3" style={{ color: "var(--color-text-muted)" }}>
        {allStores.length.toLocaleString()} verified {allStores.length === 1 ? "store" : "stores"} in{" "}
        {cityName}.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Link
          href={buysOnly ? `/${state.slug}/${citySlug}` : `/${state.slug}/${citySlug}?buys=1`}
          className="btn btn-secondary"
          aria-pressed={buysOnly}
        >
          {buysOnly ? "✕ Showing: Buys Selected Items Only" : "Buys Selected Items Only"}
        </Link>
      </div>

      {buysOnly && (
        <p className="mt-3 text-sm" style={{ color: "var(--color-text-muted)" }}>
          Showing {stores.length} of {allStores.length} stores with a confirmed direct-purchase
          policy. Stores with an unknown buying policy are not included in this filter -- that
          doesn&apos;t mean they don&apos;t buy, only that it hasn&apos;t been confirmed.
        </p>
      )}

      <div className="mt-8 flex flex-col gap-3">
        {stores.length === 0 ? (
          <EmptyState
            message={
              buysOnly
                ? `No stores in ${cityName} have a confirmed direct-purchase policy yet.`
                : `No stores found in ${cityName}.`
            }
            action={
              buysOnly
                ? { href: `/${state.slug}/${citySlug}`, label: "Clear filter" }
                : { href: `/${state.slug}`, label: `Browse all of ${state.name}` }
            }
          />
        ) : (
          stores.map((s) => (
            <ResultRow key={s.id} store={s} href={`/${state.slug}/${citySlug}/${s.slug}`} />
          ))
        )}
      </div>
    </div>
  );
}
