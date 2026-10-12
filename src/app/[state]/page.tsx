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
  const verifiedPct = stats.total > 0 ? Math.round((stats.enrichedCount / stats.total) * 100) : 0;
  const checkedCount = stats.total - buying.neverChecked;

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <nav className="breadcrumb">
        <Link href="/">All States</Link>
      </nav>

      <div className="eyebrow">State Guide</div>
      <h1 className="mt-2" style={{ fontSize: "clamp(2rem, 4vw, 2.9rem)", fontWeight: 600 }}>
        Antique Stores in {state.name}
      </h1>
      <p className="mt-3" style={{ color: "var(--ink-soft)" }}>
        {stats.total.toLocaleString()} stores across {cities.length.toLocaleString()}{" "}
        {cities.length === 1 ? "city" : "cities"}.
      </p>

      <div className="stat-row">
        <div className="stat-tile">
          <div className="num">{stats.total.toLocaleString()}</div>
          <div className="label">Stores catalogued</div>
        </div>
        <div className="stat-tile">
          <div className="num">{stats.enrichedCount.toLocaleString()}</div>
          <div className="label">Verified listings ({verifiedPct}%)</div>
        </div>
        <div className="stat-tile">
          <div className="num">{stats.cityCount.toLocaleString()}</div>
          <div className="label">Cities represented</div>
        </div>
        <div className="stat-tile">
          <div className="num">{stats.buysOutrightCount.toLocaleString()}</div>
          <div className="label">Buy antiques outright</div>
        </div>
      </div>

      {categories.length > 0 && (
        <>
          <div className="section-head">
            <h2>What {state.name} Stores Carry</h2>
            <p className="lede">
              Category breakdown across all {stats.total.toLocaleString()} {state.name} listings.
              &quot;Antique store&quot; is Google&apos;s own catch-all category -- most of what&apos;s inside
              it only becomes specific once a listing is individually verified.
            </p>
          </div>
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

      {featured.length > 0 && (
        <>
          <div className="section-head">
            <h2>Highest-Rated Antique Stores in {state.name}</h2>
            <p className="lede">
              Verified listings only, restricted to genuine antique/antique-furniture
              categories, minimum 10 reviews.
            </p>
          </div>
          <div className="mini-card-grid">
            {featured.map((s) => (
              <Link
                key={s.id}
                href={`/${state.slug}/${slugify(s.city)}/${s.slug}`}
                className="mini-card"
              >
                <span className="eyebrow">{s.primarySpecialty || s.category}</span>
                <h3>{s.name}</h3>
                <div className="loc">
                  {s.city}, {state.code}
                </div>
                <div className="rating mono">
                  <span className="stars">★</span> {s.rating!.toFixed(1)}{" "}
                  <span style={{ color: "var(--ink-faint)" }}>({s.reviews} reviews)</span>
                </div>
              </Link>
            ))}
          </div>
        </>
      )}

      {checkedCount > 0 && (
        <>
          <div className="section-head">
            <h2>How {state.name} Stores Buy</h2>
            <p className="lede">
              Of the {stats.total.toLocaleString()} listings, {buying.neverChecked.toLocaleString()}{" "}
              have never been checked for a buying policy. Among the {checkedCount.toLocaleString()}{" "}
              that were:
            </p>
          </div>
          <div className="badges" style={{ marginTop: "14px" }}>
            {buying.buysOutright > 0 && (
              <span className="badge buys">{buying.buysOutright} Buy Outright</span>
            )}
            {buying.consignmentOnly > 0 && (
              <span className="badge plain">{buying.consignmentOnly} Consignment / Vendor Booth Only</span>
            )}
            {buying.checkedUnclear > 0 && (
              <span className="badge unclear">{buying.checkedUnclear} Checked -- Still Unclear</span>
            )}
          </div>
        </>
      )}

      <div className="section-head">
        <h2>Top Cities</h2>
        <p className="lede">
          By store count. All {cities.length.toLocaleString()} {state.name} cities are browsable below.
        </p>
      </div>
      <ul className="geo-grid" style={{ listStyle: "none", padding: 0 }}>
        {topCities.map((c) => (
          <li key={c.slug}>
            <Link href={`/${state.slug}/${c.slug}`} className="geo-link">
              <span>{c.city}</span>
              <span className="count mono">{c.count.toLocaleString()}</span>
            </Link>
          </li>
        ))}
      </ul>

      {allCitiesAZ.length > topCities.length && (
        <details className="all-cities browse-all">
          <summary>
            Browse all {cities.length.toLocaleString()} {state.name} cities &rarr;
          </summary>
          <ul className="geo-grid" style={{ listStyle: "none", padding: 0, marginTop: "20px" }}>
            {allCitiesAZ.map((c) => (
              <li key={c.slug}>
                <Link href={`/${state.slug}/${c.slug}`} className="geo-link">
                  <span>{c.city}</span>
                  <span className="count mono">{c.count.toLocaleString()}</span>
                </Link>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
