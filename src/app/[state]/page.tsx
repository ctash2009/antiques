import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { STATES, slugify, stateBySlug } from "@/lib/geo";
import {
  getCitiesForState,
  getStateBuyingModelBreakdown,
  getStateCategoryBreakdown,
  getStateFeaturedStores,
  getStateStats,
} from "@/lib/stores";

export const revalidate = 3600;

const TOP_CITIES_COUNT = 24;

// All 51 are generated at build time -- cheap, and they're the top of the
// geo hierarchy so they're worth having ready instantly.
export function generateStaticParams() {
  return STATES.map((s) => ({ state: s.slug }));
}

type Props = { params: Promise<{ state: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { state: stateSlug } = await params;
  const state = stateBySlug(stateSlug);
  if (!state) return {};
  return {
    title: `Antique Stores in ${state.name}`,
    description: `Browse antique shops, vintage dealers, and collectibles stores by city in ${state.name}.`,
  };
}

export default async function StatePage({ params }: Props) {
  const { state: stateSlug } = await params;
  const state = stateBySlug(stateSlug);
  if (!state) notFound();

  const [cities, stats, categories, featured, buying] = await Promise.all([
    getCitiesForState(state.code),
    getStateStats(state.code),
    getStateCategoryBreakdown(state.code),
    getStateFeaturedStores(state.code),
    getStateBuyingModelBreakdown(state.code),
  ]);
  if (cities.length === 0) notFound();

  const topCities = [...cities].sort((a, b) => b.count - a.count).slice(0, TOP_CITIES_COUNT);
  const allCitiesAZ = [...cities].sort((a, b) => a.city.localeCompare(b.city));
  const maxCategoryCount = categories[0]?.count ?? 1;
  const checkedCount = stats.total - buying.neverChecked;

  return (
    <div className="mx-auto px-4 py-10" style={{ maxWidth: "var(--content-max)" }}>
      <nav className="breadcrumb">
        <Link href="/">All States</Link>
      </nav>

      <h1 className="mt-2" style={{ fontSize: "clamp(2rem, 4vw, 2.9rem)", fontWeight: 600 }}>
        Antique Stores in {state.name}
      </h1>
      <p className="mt-2 text-sm" style={{ color: "var(--color-text-muted)" }}>
        {stats.total.toLocaleString()} stores across {cities.length.toLocaleString()}{" "}
        {cities.length === 1 ? "city" : "cities"}.
      </p>

      <div className="section-head" style={{ marginTop: "var(--space-8)" }}>
        <h2>Find a City in {state.name}</h2>
        <p className="lede">
          All {cities.length.toLocaleString()} cities are browsable below. Top cities by store
          count are listed first.
        </p>
      </div>
      <ul className="geo-grid" style={{ listStyle: "none", padding: 0 }}>
        {topCities.map((c) => (
          <li key={c.slug}>
            <Link href={`/${state.slug}/${c.slug}`} className="geo-link">
              <span>{c.city}</span>
              <span className="count">{c.count.toLocaleString()}</span>
            </Link>
          </li>
        ))}
      </ul>

      {allCitiesAZ.length > topCities.length && (
        <details className="disclosure">
          <summary>Browse all {cities.length.toLocaleString()} {state.name} cities, A-Z &rarr;</summary>
          <ul className="geo-grid" style={{ listStyle: "none", padding: 0, marginTop: "var(--space-4)" }}>
            {allCitiesAZ.map((c) => (
              <li key={c.slug}>
                <Link href={`/${state.slug}/${c.slug}`} className="geo-link">
                  <span>{c.city}</span>
                  <span className="count">{c.count.toLocaleString()}</span>
                </Link>
              </li>
            ))}
          </ul>
        </details>
      )}

      <div className="section-head">
        <Link href={`/search?buys=1`} className="btn btn-secondary">
          Find Confirmed Buyers in {state.name}
        </Link>
      </div>

      {featured.length > 0 && (
        <>
          <div className="section-head">
            <h2>Highest-Rated Antique Stores in {state.name}</h2>
            <p className="lede">
              Selection criteria: verified listings, genuine antique/antique-furniture categories
              only, minimum 10 reviews. A high score with few reviews is not automatically the
              strongest recommendation for every visitor.
            </p>
          </div>
          <div className="mini-card-grid">
            {featured.map((s) => (
              <Link
                key={s.id}
                href={`/${state.slug}/${slugify(s.city)}/${s.slug}`}
                className="mini-card"
              >
                <h3>{s.name}</h3>
                <div className="loc">
                  {s.city}, {state.code}
                </div>
                <p className="specialty-line">{s.primarySpecialty || s.category}</p>
                <div className="rating">
                  <span className="stars">★</span> {s.rating!.toFixed(1)} ({s.reviews} reviews)
                </div>
              </Link>
            ))}
          </div>
        </>
      )}

      <details className="disclosure" style={{ marginTop: "var(--space-12)" }}>
        <summary>Research coverage and data breakdown for {state.name}</summary>
        <div className="stat-row">
          <div className="stat-tile">
            <div className="num">{stats.total.toLocaleString()}</div>
            <div className="label">Stores catalogued</div>
          </div>
          <div className="stat-tile">
            <div className="num">{stats.enrichedCount.toLocaleString()}</div>
            <div className="label">Websites individually reviewed</div>
          </div>
          <div className="stat-tile">
            <div className="num">{stats.cityCount.toLocaleString()}</div>
            <div className="label">Cities represented</div>
          </div>
          <div className="stat-tile">
            <div className="num">{stats.buysOutrightCount.toLocaleString()}</div>
            <div className="label">Confirmed direct buyers</div>
          </div>
        </div>

        {categories.length > 0 && (
          <>
            <p className="lede" style={{ marginTop: "var(--space-8)" }}>
              Categories as Google&apos;s own business listings describe these stores. This measures
              how listings are categorized, not verified inventory -- most of what&apos;s inside
              the catch-all &quot;Antique store&quot; category only becomes specific once a
              listing is individually reviewed.
            </p>
            <div className="bar-list">
              {categories.map((c) => (
                <div key={c.category} className="bar-row">
                  <div className="name">{c.category}</div>
                  <div className="bar-track">
                    <div
                      className="bar-fill"
                      style={{ width: `${Math.round((c.count / maxCategoryCount) * 100)}%` }}
                    />
                  </div>
                  <div className="count">{c.count.toLocaleString()}</div>
                </div>
              ))}
            </div>
          </>
        )}

        {checkedCount > 0 && (
          <>
            <p className="lede" style={{ marginTop: "var(--space-8)" }}>
              Buying-policy research coverage is a different measure from general website review
              coverage above -- a store can have a reviewed website without a confirmed buying
              policy, or vice versa. Of {stats.total.toLocaleString()} listings,{" "}
              {buying.neverChecked.toLocaleString()} have never been checked for a buying policy.
              Among the {checkedCount.toLocaleString()} that were:
            </p>
            <div className="badges" style={{ marginTop: "var(--space-3)" }}>
              {buying.buysOutright > 0 && (
                <span className="badge buys">{buying.buysOutright} Buy Selected Items</span>
              )}
              {buying.consignmentOnly > 0 && (
                <span className="badge plain">{buying.consignmentOnly} Consignment / Vendor Booths Only</span>
              )}
              {buying.checkedUnclear > 0 && (
                <span className="badge unknown">{buying.checkedUnclear} Checked -- Still Unknown</span>
              )}
            </div>
          </>
        )}
      </details>
    </div>
  );
}
