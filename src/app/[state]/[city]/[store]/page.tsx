import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { parseStoreSlug, slugify, stateBySlug } from "@/lib/geo";
import { getStoreById, type StoreDetail } from "@/lib/stores";
import { breadcrumbJsonLd, storeJsonLd } from "@/lib/jsonld";
import { JsonLd } from "@/components/JsonLd";
import { getSiteUrl } from "@/lib/site";

// Listings are not prerendered at build time (34,928 of them) -- each
// renders on first visit and is cached for `revalidate` seconds (ISR).
// Enrichment data changes rarely once a store has been processed, so this
// is longer than the city page's.
export const revalidate = 86400;

type Props = { params: Promise<{ state: string; city: string; store: string }> };

const DAY_ORDER = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

const BUSINESS_MODEL_LABEL: Record<string, string> = {
  single_dealer: "Single Dealer",
  single_dealor: "Single Dealer", // data-entry typo seen in a handful of rows
  multi_vendor_mall: "Multi-Vendor Marketplace",
};

const BUYING_MODEL_SUFFIX: Record<string, string> = {
  buys_outright: " -- Outright Purchase",
  consignment_vendor_booth: " -- Consignment / Vendor Booth",
};

// Badges only assert what the enrichment pipeline actually confirmed --
// no badge at all beats a guessed one, per the enrichment methodology's
// rule against treating the raw "buys used goods" flag as fact on its own.
function buildBadges(store: StoreDetail) {
  const badges: { cls: string; text: string }[] = [];

  if (store.buysAntiques === true) {
    const suffix = store.buyingModel ? BUYING_MODEL_SUFFIX[store.buyingModel] ?? "" : "";
    badges.push({ cls: "buys", text: `✓ Buys Antiques${suffix}` });
  } else if (store.buysAntiques === false) {
    badges.push({ cls: "plain", text: "Does Not Buy Antiques" });
  } else if (store.enrichmentStatus === "enriched" && store.buyingModel === "unclear") {
    badges.push({ cls: "unclear", text: "Buying Policy Unclear" });
  }

  if (store.businessModel === "appointment_only_showroom") {
    badges.push({ cls: "appt", text: "By Appointment Only" });
  } else if (store.businessModel && BUSINESS_MODEL_LABEL[store.businessModel]) {
    badges.push({ cls: "plain", text: BUSINESS_MODEL_LABEL[store.businessModel] });
  }

  if (store.smallBusiness === true) {
    badges.push({ cls: "plain", text: "Small Business" });
  }

  return badges;
}

async function resolve(params: Props["params"]) {
  const { state: stateSlug, city: citySlug, store: storeSlug } = await params;
  const state = stateBySlug(stateSlug);
  if (!state) return null;

  const id = parseStoreSlug(storeSlug);
  if (id === null) return null;

  const store = await getStoreById(id);
  if (!store || store.stateCode !== state.code) return null;

  return { state, citySlug, store };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const resolved = await resolve(params);
  if (!resolved) return {};
  const { state, store } = resolved;
  return {
    title: `${store.name} -- Antique Store in ${store.city}, ${state.code}`,
    description:
      store.enrichedDescription ??
      `${store.name} is an antique store in ${store.city}, ${state.name}. Find address, hours, and contact info.`,
  };
}

export default async function StorePage({ params }: Props) {
  const resolved = await resolve(params);
  if (!resolved) notFound();
  const { state, citySlug, store } = resolved;

  // Canonicalize: if the city segment in the URL doesn't match the store's
  // actual city slug (stale link, renamed city, etc.), redirect to the
  // correct URL instead of 404ing or silently rendering under a wrong path.
  const canonicalCitySlug = slugify(store.city);
  if (citySlug !== canonicalCitySlug) {
    redirect(`/${state.slug}/${canonicalCitySlug}/${store.slug}`);
  }

  const pageUrl = `${getSiteUrl()}/${state.slug}/${citySlug}/${store.slug}`;
  const badges = buildBadges(store);
  const description = store.enrichedDescription ?? store.description;

  // Real secondary tags come from `subtypes` (e.g. "Collectibles store,
  // Clothing store") rather than a curated list -- dedupe against the
  // primary specialty/category already shown in the hero.
  const tags = (store.subtypes ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter((t) => t && t.toLowerCase() !== (store.category ?? "").toLowerCase());

  const orderedHours = store.workingHours
    ? DAY_ORDER.filter((d) => d in store.workingHours!).map((d) => ({
        day: d,
        time: store.workingHours![d].join(", "),
      }))
    : null;

  const directionsUrl =
    store.latitude !== null && store.longitude !== null
      ? `https://www.google.com/maps/search/?api=1&query=${store.latitude},${store.longitude}`
      : store.address
        ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(store.address)}`
        : null;

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <JsonLd
        data={breadcrumbJsonLd([
          { name: "All States", path: "/" },
          { name: state.name, path: `/${state.slug}` },
          { name: store.city, path: `/${state.slug}/${citySlug}` },
          { name: store.name, path: `/${state.slug}/${citySlug}/${store.slug}` },
        ])}
      />
      <JsonLd data={storeJsonLd(store, pageUrl)} />

      <nav className="breadcrumb">
        <Link href="/">All States</Link>
        <span className="sep">/</span>
        <Link href={`/${state.slug}`}>{state.name}</Link>
        <span className="sep">/</span>
        <Link href={`/${state.slug}/${citySlug}`}>{store.city}</Link>
      </nav>

      <div className="mt-6" style={{ borderBottom: "1px solid var(--line)", paddingBottom: "28px" }}>
        <div className="eyebrow">{store.primarySpecialty || store.category || "Antique Store"}</div>
        <h1 className="mt-2" style={{ fontSize: "clamp(2rem, 4vw, 2.9rem)", fontWeight: 600 }}>
          {store.name}
        </h1>
        <div className="mt-3 flex flex-wrap items-center gap-4" style={{ color: "var(--ink-soft)" }}>
          {store.rating !== null && (
            <span>
              <span className="stars">★★★★★</span> {store.rating.toFixed(1)}{" "}
              {store.reviews !== null && (
                <span style={{ color: "var(--ink-faint)" }}>({store.reviews} reviews)</span>
              )}
            </span>
          )}
          <span className="mono">
            {store.address ?? `${store.city}, ${state.code}`}
          </span>
        </div>
        {badges.length > 0 && (
          <div className="badges mt-5">
            {badges.map((b, i) => (
              <span key={i} className={`badge ${b.cls}`}>
                {b.text}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="grid gap-10" style={{ gridTemplateColumns: "1fr 320px", paddingTop: "36px" }}>
        <main>
          {store.enrichmentStatus === "insufficient_data" && (
            <div
              className="mb-8"
              style={{
                borderRadius: "var(--radius)",
                border: "1px solid var(--oxblood)",
                background: "var(--oxblood-bg)",
                color: "var(--oxblood)",
                padding: "10px 14px",
                fontSize: "0.9rem",
              }}
            >
              We don&apos;t have verified details for this listing yet.
            </div>
          )}

          <section className="mb-9">
            {store.photo ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element -- external Google Business Profile photo, not an optimizable local asset */}
                <img
                  src={store.photo}
                  alt={store.name}
                  style={{
                    width: "100%",
                    aspectRatio: "4/3",
                    objectFit: "cover",
                    borderRadius: "var(--radius)",
                    border: "1px solid var(--card-line)",
                  }}
                />
                {store.photosCount !== null && store.photosCount > 1 && (
                  <div className="mono mt-2 text-xs" style={{ color: "var(--ink-faint)" }}>
                    {store.photosCount} photos on file
                  </div>
                )}
              </>
            ) : (
              <div className="photo-tile" style={{ aspectRatio: "16/7" }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4">
                  <path d="M4 18V9a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v9M4 18h16M4 18v2M20 18v2M7 7V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v2" />
                </svg>
              </div>
            )}
          </section>

          {description && (
            <section className="mb-9">
              <h2 style={{ fontSize: "1.3rem", fontWeight: 600, marginBottom: "14px" }}>
                About {store.name}
              </h2>
              <p style={{ maxWidth: "64ch" }}>{description}</p>
              {tags.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {tags.map((t) => (
                    <span key={t} className="tag">
                      {t}
                    </span>
                  ))}
                </div>
              )}
            </section>
          )}

          {store.buysAntiques === true && (
            <section className="mb-9">
              <h2 style={{ fontSize: "1.3rem", fontWeight: 600, marginBottom: "14px" }}>
                Selling to {store.name}
              </h2>
              <div className="sell-card">
                <h3 style={{ fontSize: "1.05rem", fontWeight: 600, color: "var(--verdigris)" }}>
                  {"✓"} Buys antiques
                  {store.buyingModel ? BUYING_MODEL_SUFFIX[store.buyingModel] ?? "" : ""}
                </h3>
                <p className="mt-2" style={{ color: "var(--ink-soft)" }}>
                  Contact the store directly to arrange a sale -- items and
                  pricing are reviewed on a case-by-case basis.
                </p>
              </div>
            </section>
          )}
        </main>

        <aside>
          <div className="sidebar-card" style={{ position: "sticky", top: "20px" }}>
            {store.latitude !== null && store.longitude !== null && (
              <div className="map-swatch">
                <svg className="map-pin" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2a7 7 0 0 0-7 7c0 5.25 7 13 7 13s7-7.75 7-13a7 7 0 0 0-7-7Zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5Z" />
                </svg>
              </div>
            )}
            <div className="p-5">
              <h3 className="sidebar-label mb-2.5">Visit</h3>
              {store.address && (
                <div className="mb-3.5 text-sm">
                  {store.address}
                  {directionsUrl && (
                    <>
                      <br />
                      <a
                        href={directionsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mono text-xs"
                      >
                        Get directions &rarr;
                      </a>
                    </>
                  )}
                </div>
              )}
              <div className="mb-4 flex flex-col gap-1.5 text-sm">
                {store.phone && (
                  <a href={`tel:${store.phone}`} className="mono">
                    {store.phone}
                  </a>
                )}
                {store.website && (
                  <a href={store.website} target="_blank" rel="noopener noreferrer nofollow">
                    {store.website.replace(/^https?:\/\//, "").replace(/\/$/, "")} &#8599;
                  </a>
                )}
              </div>

              {store.businessModel === "appointment_only_showroom" && (
                <div className="appt-note mb-4">
                  By appointment only -- contact the store to schedule a visit.
                </div>
              )}

              {orderedHours && orderedHours.length > 0 && (
                <>
                  <div className="divider mb-4" />
                  <h3 className="sidebar-label mb-2.5">Hours</h3>
                  <div className="hours-grid mono">
                    {orderedHours.map(({ day, time }) => (
                      <div key={day} className="contents">
                        <div className="day">{day.slice(0, 3)}</div>
                        <div className="time">{time}</div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
