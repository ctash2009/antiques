import type { Metadata } from "next";
import Link from "next/link";
import { slugify, stateByCode } from "@/lib/geo";
import { searchStores } from "@/lib/stores";
import { StoreCard } from "@/components/StoreCard";

// Search results are excluded from the index -- they're query-dependent,
// often thin, and would otherwise create near-duplicate-content pages
// against the real city/listing pages, per [[site_search_feature]] memory.
export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ q?: string }> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const { q } = await searchParams;
  return {
    title: q ? `Search: ${q}` : "Search",
    robots: { index: false, follow: true },
  };
}

export default async function SearchPage({ searchParams }: Props) {
  const { q = "" } = await searchParams;
  const results = q.trim() ? await searchStores(q, 30) : [];

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <nav className="breadcrumb">
        <Link href="/">All States</Link>
      </nav>

      <h1 className="mt-2" style={{ fontSize: "clamp(2rem, 4vw, 2.9rem)", fontWeight: 600 }}>
        Search
      </h1>

      <form className="search-box" action="/search" method="get">
        <input type="text" name="q" defaultValue={q} placeholder="Store name, city, or specialty…" />
        <button type="submit">Search</button>
      </form>

      {q.trim() ? (
        <>
          <p className="mt-6" style={{ color: "var(--ink-soft)" }}>
            {results.length === 0
              ? `No stores matched "${q}".`
              : `${results.length} ${results.length === 1 ? "result" : "results"} for "${q}".`}
          </p>
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {results.map((s) => {
              const state = stateByCode(s.stateCode);
              const href = `/${state?.slug ?? s.stateCode.toLowerCase()}/${slugify(s.city)}/${s.slug}`;
              return <StoreCard key={s.id} store={s} href={href} />;
            })}
          </div>
        </>
      ) : (
        <p className="mt-6" style={{ color: "var(--ink-soft)" }}>
          Enter a store name, city, or specialty above.
        </p>
      )}
    </div>
  );
}
