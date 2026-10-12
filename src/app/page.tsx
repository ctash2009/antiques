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
    <div className="mx-auto max-w-5xl px-4 py-10">
      <div className="eyebrow">{total.toLocaleString()} stores catalogued</div>
      <h1 className="mt-2" style={{ fontSize: "clamp(2rem, 4vw, 2.9rem)", fontWeight: 600 }}>
        Antique &amp; Vintage Stores, State by State
      </h1>
      <p className="mt-3 max-w-2xl" style={{ color: "var(--ink-soft)" }}>
        Browse antique shops, vintage dealers, and collectibles stores across
        the United States. Pick a state to find stores near you, or search
        by name, city, or specialty.
      </p>

      <form className="search-box" action="/search" method="get">
        <input
          type="text"
          name="q"
          placeholder={'Try "Danish Modern", "Austin", or a store name…'}
        />
        <button type="submit">Search</button>
      </form>
      <div className="search-hint">Searches store name, city, and specialty across the full catalogue.</div>

      {recentlyUpdated.length > 0 && (
        <>
          <div className="section-head">
            <h2>Recently Updated</h2>
            <div className="note">verified by our research pipeline, not newly discovered</div>
          </div>
          <div className="mini-card-grid">
            {recentlyUpdated.map((s) => (
              <Link key={s.id} href={storeHref(s)} className="mini-card">
                <span className="eyebrow">{s.primarySpecialty || s.category || "Antique Store"}</span>
                <h3>{s.name}</h3>
                <div className="loc">
                  {s.city}, {s.stateCode}
                </div>
                {s.rating !== null && (
                  <div className="rating mono">
                    <span className="stars">★</span> {s.rating.toFixed(1)}{" "}
                    {s.reviews !== null && (
                      <span style={{ color: "var(--ink-faint)" }}>({s.reviews} reviews)</span>
                    )}
                  </div>
                )}
              </Link>
            ))}
          </div>
        </>
      )}

      <div className="section-head">
        <h2>Browse by Specialty</h2>
        <div className="note">full category pages coming soon</div>
      </div>
      <div className="specialty-row">
        {specialties
          .filter((s) => s.count > 0)
          .map((s) => (
            <span key={s.label} className="specialty-pill">
              <span>{s.label}</span>
              <span className="count mono">{s.count.toLocaleString()}</span>
            </span>
          ))}
      </div>

      <div className="section-head">
        <h2>Browse by State</h2>
      </div>
      <ul className="geo-grid" style={{ listStyle: "none", padding: 0 }}>
        {states.map((s) => (
          <li key={s.code}>
            <Link href={`/${s.slug}`} className="geo-link">
              <span>{s.name}</span>
              <span className="count mono">{s.count.toLocaleString()}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
