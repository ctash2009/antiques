import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { parseStoreSlug, slugify, stateBySlug } from "@/lib/geo";
import { getStoreById } from "@/lib/stores";
import { breadcrumbJsonLd, storeJsonLd } from "@/lib/jsonld";
import { JsonLd } from "@/components/JsonLd";
import { getSiteUrl } from "@/lib/site";
import { buyingPolicyBadges, isAppointmentOnly, researchStatusBadge, storeFormatBadges } from "@/lib/policy";
import { Badges } from "@/components/Badges";
import { EvidenceNote } from "@/components/EvidenceNote";
import { StorePhoto } from "@/components/StorePhoto";
import { StoreMap } from "@/components/StoreMap";

// Listings are not prerendered at build time (34,928 of them) -- each
// renders on first visit and is cached for `revalidate` seconds (ISR).
// Enrichment data changes rarely once a store has been processed, so this
// is longer than the city page's.
export const revalidate = 86400;

type Props = { params: Promise<{ state: string; city: string; store: string }> };

const DAY_ORDER = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

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
    // Canonical uses the store's actual city slug, not the URL's --
    // matches the page's own redirect logic, so the canonical tag never
    // points at a URL that itself 302s elsewhere.
    alternates: { canonical: `/${state.slug}/${slugify(store.city)}/${store.slug}` },
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
  const researchBadge = researchStatusBadge(store.enrichmentStatus);
  const badges = researchBadge
    ? [researchBadge]
    : [...storeFormatBadges(store), ...buyingPolicyBadges(store)];
  const appointmentOnly = isAppointmentOnly(store);
  const description = store.enrichedDescription ?? store.description;
  const buysSelectedItems = store.buysAntiques === true;

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
    <div className="mx-auto px-4 py-10" style={{ maxWidth: "var(--content-max)" }}>
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

      {/* Name, location, specialty, rating, buying policy, and appointment
          requirement all live in this top block, above the fold, per the
          design guidelines -- a visitor shouldn't have to scroll past
          photos to find out whether this is a walk-in shop. */}
      <div className="mt-4" style={{ borderBottom: "1px solid var(--color-border)", paddingBottom: "var(--space-6)" }}>
        <h1 style={{ fontSize: "clamp(2rem, 4vw, 2.9rem)", fontWeight: 600 }}>{store.name}</h1>
        <p className="mt-1" style={{ color: "var(--color-text-muted)", fontSize: "16px" }}>
          {store.city}, {state.code}
          {" -- "}
          {store.primarySpecialty || store.category || "Antique store"}
        </p>

        {store.rating !== null && (
          <p className="mt-2" style={{ color: "var(--color-text-muted)" }}>
            <span className="stars">★</span> {store.rating.toFixed(1)}
            {store.reviews !== null && <> ({store.reviews} reviews)</>}
          </p>
        )}

        <div className="mt-4">
          <Badges badges={badges} />
        </div>

        {appointmentOnly && (
          <div className="notice-box mt-4">
            By appointment only -- posted hours don&apos;t mean walk-in access. Contact the store
            to schedule a visit.
          </div>
        )}

        {/* Contact actions, near the title per the guidelines, not buried
            below photos/about. */}
        <div className="mt-5 flex flex-wrap gap-3">
          {store.phone && (
            <a href={`tel:${store.phone}`} className="btn btn-primary">
              Call
            </a>
          )}
          {store.website && (
            <a href={store.website} target="_blank" rel="noopener noreferrer nofollow" className="btn btn-secondary">
              Website
            </a>
          )}
          {directionsUrl && (
            <a href={directionsUrl} target="_blank" rel="noopener noreferrer" className="btn btn-secondary">
              Directions
            </a>
          )}
        </div>
      </div>

      <div className="grid gap-10" style={{ gridTemplateColumns: "1fr 320px", paddingTop: "var(--space-8)" }}>
        <main>
          <section className="mb-9">
            {store.photo ? (
              <StorePhoto src={store.photo} alt={store.name} variant="hero" />
            ) : (
              <div
                style={{
                  aspectRatio: "16/7",
                  borderRadius: "var(--radius-card)",
                  border: "1px solid var(--color-border)",
                  background: "var(--color-primary-soft)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "var(--color-text-muted)",
                  fontSize: "14px",
                }}
              >
                Photo unavailable
              </div>
            )}
          </section>

          {buysSelectedItems && (
            <section className="mb-9">
              <h2 style={{ fontSize: "1.3rem", fontWeight: 600, marginBottom: "var(--space-3)" }}>
                Selling to {store.name}
              </h2>
              <div
                style={{
                  background: "var(--color-surface)",
                  border: "1px solid var(--color-border)",
                  borderLeft: "4px solid var(--color-primary)",
                  borderRadius: "var(--radius-card)",
                  padding: "var(--space-5, 20px)",
                }}
              >
                <p style={{ fontWeight: 600, color: "var(--color-primary)" }}>
                  {store.buyingModel === "buys_outright"
                    ? "Buys selected items directly"
                    : "Buys selected items"}
                </p>
                <p className="mt-2" style={{ color: "var(--color-text-muted)" }}>
                  Contact the store directly to arrange a sale -- items and pricing are reviewed
                  on a case-by-case basis. This describes a purchasing service, not a promise to
                  accept any specific item.
                </p>
                <EvidenceNote store={store} />
              </div>
            </section>
          )}

          {description && (
            <section className="mb-9">
              <h2 style={{ fontSize: "1.3rem", fontWeight: 600, marginBottom: "var(--space-3)" }}>
                About {store.name}
              </h2>
              <p style={{ maxWidth: "64ch" }}>{description}</p>
              <EvidenceNote store={store} />
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
        </main>

        <aside>
          <div className="contact-panel" style={{ position: "sticky", top: "20px" }}>
            {store.latitude !== null && store.longitude !== null && (
              <StoreMap latitude={store.latitude} longitude={store.longitude} name={store.name} />
            )}
            <div className="contact-panel-inner">
              <h2 className="contact-label mb-2">Visit</h2>
              {store.address && (
                <div className="mb-4 text-sm">
                  {store.address}
                  {directionsUrl && (
                    <>
                      <br />
                      <a href={directionsUrl} target="_blank" rel="noopener noreferrer" className="inline-link text-sm">
                        Get directions
                      </a>
                    </>
                  )}
                </div>
              )}
              <div className="mb-4 flex flex-col gap-2 text-sm">
                {store.phone && (
                  <a href={`tel:${store.phone}`} className="inline-link">
                    {store.phone}
                  </a>
                )}
                {store.website && (
                  <a href={store.website} target="_blank" rel="noopener noreferrer nofollow" className="inline-link">
                    {store.website.replace(/^https?:\/\//, "").replace(/\/$/, "")}
                  </a>
                )}
              </div>

              {orderedHours && orderedHours.length > 0 && (
                <>
                  <div className="divider mb-4" />
                  <h2 className="contact-label mb-2">Hours</h2>
                  <div className="hours-grid">
                    {orderedHours.map(({ day, time }) => (
                      <div key={day} className="contents">
                        <div className="day">{day.slice(0, 3)}</div>
                        <div className="time">{time}</div>
                      </div>
                    ))}
                  </div>
                  <p className="mt-2 text-sm" style={{ color: "var(--color-text-muted)" }}>
                    Posted hours don&apos;t imply walk-in access
                    {appointmentOnly ? " -- this location is appointment-only." : "; call to confirm."}
                  </p>
                </>
              )}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
