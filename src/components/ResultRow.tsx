import Link from "next/link";
import type { StoreCard } from "@/lib/stores";
import { buyingPolicyBadges, researchStatusBadge, storeFormatBadges } from "@/lib/policy";
import { Badges } from "./Badges";

// Shared result-row used on city and search pages. Hierarchy per the
// design guidelines: name -> location -> specialty summary -> buying/visit
// badges -> rating. A photo thumbnail when one exists; a plain storefront
// icon (not a forced placeholder photo) otherwise.
export function ResultRow({ store, href }: { store: StoreCard; href: string }) {
  const researchBadge = researchStatusBadge(store.enrichmentStatus);
  const badges = researchBadge
    ? [researchBadge]
    : [...storeFormatBadges(store), ...buyingPolicyBadges(store)];

  return (
    <Link href={href} className="result-row">
      <div className="thumb">
        {store.photo ? (
          // eslint-disable-next-line @next/next/no-img-element -- external Google Business Profile photo
          <img src={store.photo} alt="" />
        ) : (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4">
            <path d="M4 18V9a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v9M4 18h16M4 18v2M20 18v2M7 7V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v2" />
          </svg>
        )}
      </div>
      <div className="main">
        <h3>{store.name}</h3>
        <div className="loc">
          {store.city}, {store.stateCode}
        </div>
        <p className="specialty">{store.primarySpecialty || store.category || "Antique store"}</p>
        <Badges badges={badges} />
        {store.rating !== null ? (
          <div className="rating">
            <span className="stars">★</span> {store.rating.toFixed(1)}
            {store.reviews !== null && <> ({store.reviews} reviews)</>}
          </div>
        ) : (
          <div className="rating">No rating on file</div>
        )}
      </div>
    </Link>
  );
}
