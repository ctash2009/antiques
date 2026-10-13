import type { StoreDetail } from "./stores";

export type Evidence = { sourceUrl: string; checkedAt: Date | null };

// Per guidelines section 5: display "Website checked [date]" only when
// that's literally true, and never produce a broad "Verified" seal from
// automated extraction alone. `enrichment_sources` holds real URLs the
// pipeline actually read; when it's empty the record was inferred from
// the business name/category alone (plenty of real `primary_specialty`
// values literally say "based on store name only, low confidence") --
// there's nothing to disclose as evidence in that case, so this returns
// null and callers should render no evidence block at all rather than a
// fabricated-sounding one.
export function getEvidence(store: StoreDetail): Evidence | null {
  const sources = store.enrichmentSources;
  if (!sources || sources.length === 0) return null;
  return {
    sourceUrl: sources[0],
    checkedAt: store.enrichedAt,
  };
}
