import Link from "next/link";
import { STATES, slugify, stateByCode } from "@/lib/geo";
import {
  getRecentlyUpdated,
  getSpecialtyTeaser,
  getStateCounts,
  getTotalStoreCount,
  type StoreCard,
} from "@/lib/stores";

export const revalidate = 3600;

function storeHref(store: StoreCard): string {
  const state = stateByCode(store.stateCode);
  return `/${state?.slug ?? store.stateCode.toLowerCase()}/${slugify(store.city)}/${store.slug}`;
}

export default async function Home() {
  const [counts, total, recentlyUpdated, specialties] = await Promise.all([
    getStateCounts(),
    getTotalStoreCount(),
    getRecentlyUpdated(3),
    getSpecialtyTeaser(),
  ]);
  const countByCode = new Map(counts.map((c) => [c.stateCode, c.count]));

  const states = STATES.map((s) => ({ ...s, count: countByCode.get(s.code) ?? 0 }))
    .filter((s) => s.count > 0)
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="mx-auto px-4 py-10" style={{ maxWidth: "var(--content-max)" }}>
      <h1 style={{ fontSize: "clamp(2rem, 4vw, 3.25rem)", fontWeight: 600 }}>
        Find antique and vintage shops near you
      </h1>
      <p className="mt-3 max-w-2xl" style={{ color: "var(--color-text-muted)", fontSize: "17px" }}>
        Browse {total.toLocaleString()} individually verified stores by specialty, buying policy, and location --
        whether you&apos;re looking for a shop to visit or a dealer who may buy what you have.
      </p>

      <div className="intent-row">
        <Link href="/search" className="intent-card">
          <h3>Find Shops to Visit</h3>
          <p>Browse by specialty, city, and state. See hours, appointment requirements, and directions.</p>
        </Link>
        <Link href="/search?buys=1" className="intent-card">
          <h3>Find Buyers for Your Items</h3>
          <p>
            Stores with a confirmed direct-purchase policy. Not an offer, appraisal, or guaranteed
            sale -- contact a store directly before sending or bringing items.
          </p>
        </Link>
      </div>

      <form className="search-box" action="/search" method="get">
        <label htmlFor="home-search-q" className="visually-hidden">
          Store name, city, or specialty
        </label>
        <input
          id="home-search-q"
          type="text"
          name="q"
          placeholder="Store name, city, or specialty…"
        />
        <button type="submit" className="btn btn-primary">
          Search
        </button>
      </form>
      <div className="search-hint">Searches store name, city, and specialty across the full catalogue.</div>

      <div className="section-head">
        <h2>Browse by Specialty</h2>
      </div>
      <div className="specialty-row">
        {specialties
          .filter((s) => s.count > 0)
          .map((s) => (
            <Link key={s.category} href={`/search?q=${encodeURIComponent(s.category)}`} className="specialty-pill">
              <span>{s.label}</span>
              <span className="count">{s.count.toLocaleString()}</span>
            </Link>
          ))}
      </div>

      <div id="states" className="section-head">
        <h2>Browse by State</h2>
      </div>
      <ul className="geo-grid" style={{ listStyle: "none", padding: 0 }}>
        {states.map((s) => (
          <li key={s.code}>
            <Link href={`/${s.slug}`} className="geo-link">
              <span>{s.name}</span>
              <span className="count">{s.count.toLocaleString()}</span>
            </Link>
          </li>
        ))}
      </ul>

      {recentlyUpdated.length > 0 && (
        <>
          <div className="section-head">
            <h2>Recently Updated</h2>
          </div>
          <div className="mini-card-grid">
            {recentlyUpdated.map((s) => (
              <Link key={s.id} href={storeHref(s)} className="mini-card">
                <h3>{s.name}</h3>
                <div className="loc">
                  {s.city}, {s.stateCode}
                </div>
                <p className="specialty-line">{s.primarySpecialty || s.category || "Antique store"}</p>
                {s.rating !== null && (
                  <div className="rating">
                    <span className="stars">★</span> {s.rating.toFixed(1)}
                    {s.reviews !== null && <> ({s.reviews} reviews)</>}
                  </div>
                )}
                {s.enrichedAt && (
                  <div className="rating">
                    Reviewed{" "}
                    {s.enrichedAt.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })}
                  </div>
                )}
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
