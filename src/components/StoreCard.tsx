import Link from "next/link";
import type { StoreCard as StoreCardType } from "@/lib/stores";

export function StoreCard({
  store,
  href,
}: {
  store: StoreCardType;
  href: string;
}) {
  return (
    <Link href={href} className="card-link">
      <div className="eyebrow">{store.primarySpecialty || store.category || "Antique Store"}</div>
      <h3 className="mt-1.5" style={{ fontSize: "1.1rem", fontWeight: 600 }}>
        {store.name}
      </h3>
      {store.rating !== null ? (
        <div className="mono mt-2 text-sm" style={{ color: "var(--ink-soft)" }}>
          <span className="stars">★</span> {store.rating.toFixed(1)}
          {store.reviews !== null && (
            <span style={{ color: "var(--ink-faint)" }}> ({store.reviews} reviews)</span>
          )}
        </div>
      ) : (
        <div className="mt-2 text-sm" style={{ color: "var(--ink-faint)" }}>
          No reviews on file
        </div>
      )}
      {store.enrichmentStatus !== "enriched" && (
        <div className="badges mt-3">
          <span className="badge unclear">Basic Listing -- Unverified</span>
        </div>
      )}
    </Link>
  );
}
