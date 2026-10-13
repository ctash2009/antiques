import type { Metadata } from "next";
import Link from "next/link";
import { slugify, stateByCode } from "@/lib/geo";
import { getConfirmedBuyers, searchStores } from "@/lib/stores";
import { ResultRow } from "@/components/ResultRow";
import { EmptyState } from "@/components/EmptyState";

// Search results are excluded from the index -- they're query-dependent,
// often thin, and would otherwise create near-duplicate-content pages
// against the real city/listing pages, per [[site_search_feature]] memory.
export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ q?: string; buys?: string }> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const { q, buys } = await searchParams;
  const title = q ? `Search: ${q}` : buys ? "Find Buyers" : "Search";
  return { title, robots: { index: false, follow: true } };
}

export default async function SearchPage({ searchParams }: Props) {
  const { q = "", buys } = await searchParams;
  const buysOnly = buys === "1" || buys === "outright";
  const hasQuery = q.trim().length > 0;

  const results = hasQuery
    ? await searchStores(q, { limit: 30, buysOnly })
    : buysOnly
      ? await getConfirmedBuyers(30)
      : [];

  const showResults = hasQuery || buysOnly;

  return (
    <div className="mx-auto px-4 py-10" style={{ maxWidth: "var(--content-max)" }}>
      <nav className="breadcrumb">
        <Link href="/">All States</Link>
      </nav>

      <h1 className="mt-2" style={{ fontSize: "clamp(2rem, 4vw, 2.9rem)", fontWeight: 600 }}>
        {buysOnly && !hasQuery ? "Find Buyers" : "Search"}
      </h1>
      {buysOnly && !hasQuery && (
        <p className="mt-2" style={{ color: "var(--color-text-muted)" }}>
          Businesses with a confirmed direct-purchase policy -- this is not an offer, appraisal,
          or guaranteed sale. Contact a store directly before sending or bringing items.
        </p>
      )}

      <form className="search-box" action="/search" method="get">
        <label htmlFor="search-q" className="visually-hidden">
          Store name, city, or specialty
        </label>
        <input
          id="search-q"
          type="text"
          name="q"
          defaultValue={q}
          placeholder="Store name, city, or specialty…"
        />
        {buysOnly && <input type="hidden" name="buys" value="1" />}
        <button type="submit" className="btn btn-primary">
          Search
        </button>
      </form>

      {showResults ? (
        <>
          <p className="mt-6" style={{ color: "var(--color-text-muted)" }}>
            {results.length === 0
              ? hasQuery
                ? `No stores matched "${q}".`
                : "No confirmed buyers on file yet."
              : `${results.length} ${results.length === 1 ? "result" : "results"}${hasQuery ? ` for "${q}"` : ""}.`}
          </p>
          {results.length === 0 ? (
            <EmptyState
              message={
                hasQuery
                  ? "Try a broader term, or browse by state instead."
                  : "Check back as more listings are verified."
              }
              action={{ href: "/", label: "Browse by state" }}
            />
          ) : (
            <div className="mt-6 flex flex-col gap-3">
              {results.map((s) => {
                const state = stateByCode(s.stateCode);
                const href = `/${state?.slug ?? s.stateCode.toLowerCase()}/${slugify(s.city)}/${s.slug}`;
                return <ResultRow key={s.id} store={s} href={href} />;
              })}
            </div>
          )}
        </>
      ) : (
        <p className="mt-6" style={{ color: "var(--color-text-muted)" }}>
          Enter a store name, city, or specialty above.
        </p>
      )}
    </div>
  );
}
