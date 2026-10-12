import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { stateBySlug } from "@/lib/geo";
import { getStoresForCity } from "@/lib/stores";
import { breadcrumbJsonLd, storeListJsonLd } from "@/lib/jsonld";
import { JsonLd } from "@/components/JsonLd";
import { StoreCard } from "@/components/StoreCard";

// Cities are not prerendered at build time (9,769 state+city combinations
// is too many for build-time generation to be practical) -- each one is
// rendered on first visit and cached for `revalidate` seconds (ISR).
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
    description: `Find antique shops and vintage dealers near you in ${result.cityName}, ${state.name}. ${result.stores.length} stores listed.`,
  };
}

export default async function CityPage({ params }: Props) {
  const { state: stateSlug, city: citySlug } = await params;
  const state = stateBySlug(stateSlug);
  if (!state) notFound();

  const result = await getStoresForCity(state.code, citySlug);
  if (!result) notFound();
  const { cityName, stores } = result;

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
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
      <p className="mt-3" style={{ color: "var(--ink-soft)" }}>
        {stores.length.toLocaleString()} {stores.length === 1 ? "store" : "stores"} near you in{" "}
        {cityName}.
      </p>

      <div className="mt-10 grid gap-3 sm:grid-cols-2">
        {stores.map((s) => (
          <StoreCard
            key={s.id}
            store={s}
            href={`/${state.slug}/${citySlug}/${s.slug}`}
          />
        ))}
      </div>
    </div>
  );
}
