import Link from "next/link";
import { STATES } from "@/lib/geo";
import { getStateCounts, getTotalStoreCount } from "@/lib/stores";

export const revalidate = 3600;

export default async function Home() {
  const [counts, total] = await Promise.all([
    getStateCounts(),
    getTotalStoreCount(),
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
        the United States. Pick a state to find stores near you.
      </p>

      <ul className="mt-10 grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3 md:grid-cols-4">
        {states.map((s) => (
          <li key={s.code}>
            <Link
              href={`/${s.slug}`}
              className="geo-link flex items-baseline justify-between gap-2 rounded px-2 py-1.5"
            >
              <span>{s.name}</span>
              <span className="mono text-xs" style={{ color: "var(--ink-faint)" }}>
                {s.count.toLocaleString()}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
