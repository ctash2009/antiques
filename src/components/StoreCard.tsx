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
    <Link
      href={href}
      className="block rounded-lg border border-stone-200 bg-white p-4 transition hover:border-stone-300 hover:shadow-sm"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-medium text-stone-900">{store.name}</h3>
          <p className="mt-0.5 text-sm text-stone-500">
            {store.primarySpecialty || store.category || "Antique store"}
          </p>
        </div>
        {store.rating !== null && (
          <div className="shrink-0 text-right text-sm">
            <span className="font-medium text-stone-900">{store.rating.toFixed(1)}</span>
            <span className="text-stone-400"> ★</span>
            {store.reviews !== null && (
              <div className="text-xs text-stone-400">{store.reviews} reviews</div>
            )}
          </div>
        )}
      </div>
      {store.enrichmentStatus !== "enriched" && (
        <p className="mt-2 text-xs text-stone-400">
          Basic listing -- details not yet verified.
        </p>
      )}
    </Link>
  );
}
