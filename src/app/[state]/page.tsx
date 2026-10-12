import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { STATES, stateBySlug } from "@/lib/geo";
import { getCitiesForState } from "@/lib/stores";

export const revalidate = 3600;

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

  const cities = await getCitiesForState(state.code);
  if (cities.length === 0) notFound();

  const totalInState = cities.reduce((sum, c) => sum + c.count, 0);

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <nav className="breadcrumb">
        <Link href="/">All States</Link>
      </nav>
      <h1 className="mt-2" style={{ fontSize: "clamp(2rem, 4vw, 2.9rem)", fontWeight: 600 }}>
        Antique Stores in {state.name}
      </h1>
      <p className="mt-3" style={{ color: "var(--ink-soft)" }}>
        {totalInState.toLocaleString()} stores across {cities.length.toLocaleString()}{" "}
        {cities.length === 1 ? "city" : "cities"}.
      </p>

      <ul className="mt-10 grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3 md:grid-cols-4">
        {cities.map((c) => (
          <li key={c.slug}>
            <Link
              href={`/${state.slug}/${c.slug}`}
              className="geo-link flex items-baseline justify-between gap-2 rounded px-2 py-1.5"
            >
              <span>{c.city}</span>
              <span className="mono text-xs" style={{ color: "var(--ink-faint)" }}>
                {c.count.toLocaleString()}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
