import { getPool } from "./db";
import { slugify } from "./geo";

// Only rows with the core fields a page needs to render, AND verified by
// the enrichment pipeline, are publicly addressable. Decided 2026-10-12:
// start with enriched-only (4,662 of 34,912 addressable rows) rather than
// the full catalog. Most non-enriched rows DO carry real Google-scrape
// data (80%+ have a rating, 86%+ a phone, 97%+ a photo even without
// enrichment) -- this isn't "those rows are empty", it's a deliberate
// choice to only publish pages the pipeline has actually looked at.
// REVISIT (per the user): bring back non-enriched rows that have a real
// website or phone number, once this baseline has shipped. See
// [[listing_minimum_requirements]] memory for the full numbers behind
// this decision and the tiers considered.
// (16 of 34,928 rows are also missing name/city/state_code outright --
// bad scrapes with nothing to show -- excluded by the same clause.)
const CORE_FIELDS_OK = `name is not null and city is not null and state_code is not null and enrichment_status = 'enriched'`;

// Categories that are definitively not antique/vintage-relevant, applied
// to city listings and search so e.g. a GameStop or a generic scrape
// artifact doesn't show up framed as an antique store. Deliberately
// narrow -- this excludes only the unambiguous cases (a mainstream
// chain-store category, a lowercase scrape-junk value, the content-free
// generic "Store"). It is NOT a general relevance filter: legitimately
// ambiguous-but-plausible categories (coin dealer, trading card store,
// vintage clothing, thrift store, consignment shop) are deliberately
// left in rather than guessed at. A chain store miscategorized under one
// of the categories we DO allow (e.g. a GameStop tagged "Collectibles
// store") will still slip through -- that needs a name-based rule this
// doesn't attempt.
const IRRELEVANT_CATEGORIES = ["Video game store", "attractions", "Store"];

// Buying-policy and store-format fields live on the base card type, not
// just StoreDetail -- the design guidelines require buying/visit status
// visible on city-page result rows, not only on the listing page itself.
export type StoreCard = {
  id: number;
  name: string;
  slug: string;
  city: string;
  stateCode: string;
  category: string | null;
  primarySpecialty: string | null;
  rating: number | null;
  reviews: number | null;
  enrichmentStatus: string | null;
  photo: string | null;
  businessModel: string | null;
  buysAntiques: boolean | null;
  buyingModel: string | null;
  smallBusiness: boolean | null;
  enrichedAt: Date | null;
};

export type StoreDetail = StoreCard & {
  address: string | null;
  street: string | null;
  postalCode: string | null;
  phone: string | null;
  website: string | null;
  latitude: number | null;
  longitude: number | null;
  workingHours: Record<string, string[]> | null;
  workingHoursCsv: string | null;
  subtypes: string | null;
  enrichedDescription: string | null;
  description: string | null;
  enrichmentConfidence: string | null;
  photosCount: number | null;
  enrichmentSources: string[] | null;
};

// Columns every list query needs so StoreCard rows carry real buying/visit
// status, not just name/rating. Spliced into each SELECT below.
const CARD_COLUMNS = `id, name, city, state_code, category, primary_specialty,
  rating, reviews, enrichment_status, photo, business_model, buys_antiques,
  buying_model, about_from_the_business_small_business, enriched_at`;

function toCard(row: Record<string, unknown>): StoreCard {
  return {
    id: row.id as number,
    name: row.name as string,
    slug: `${slugify(row.name as string)}-${row.id}`,
    city: row.city as string,
    stateCode: row.state_code as string,
    category: (row.category as string) ?? null,
    primarySpecialty: (row.primary_specialty as string) ?? null,
    rating: row.rating !== null ? Number(row.rating) : null,
    reviews: (row.reviews as number) ?? null,
    enrichmentStatus: (row.enrichment_status as string) ?? null,
    photo: (row.photo as string) ?? null,
    businessModel: (row.business_model as string) ?? null,
    buysAntiques: (row.buys_antiques as boolean) ?? null,
    buyingModel: (row.buying_model as string) ?? null,
    smallBusiness: (row.about_from_the_business_small_business as boolean) ?? null,
    enrichedAt: (row.enriched_at as Date) ?? null,
  };
}

// Every state that has at least one addressable store, with a count --
// drives the homepage.
export async function getStateCounts(): Promise<
  { stateCode: string; count: number }[]
> {
  const pool = getPool();
  const { rows } = await pool.query(
    `select state_code, count(*) as count
     from stores
     where ${CORE_FIELDS_OK}
     group by state_code
     order by state_code`,
  );
  return rows.map((r) => ({ stateCode: r.state_code, count: Number(r.count) }));
}

// Every city within a state that has at least one addressable store.
export async function getCitiesForState(
  stateCode: string,
): Promise<{ city: string; slug: string; count: number }[]> {
  const pool = getPool();
  const { rows } = await pool.query(
    `select city, count(*) as count
     from stores
     where ${CORE_FIELDS_OK} and state_code = $1
     group by city
     order by city`,
    [stateCode],
  );
  return rows.map((r) => ({
    city: r.city as string,
    slug: slugify(r.city as string),
    count: Number(r.count),
  }));
}

// Store cards for a city. The slug is resolved against the (small, grouped)
// list of distinct city names in the state first, then stores are fetched
// by exact city name -- avoids pulling every row in the state just to
// filter by slug in JS, which matters for a state like CA (2,862 rows).
export async function getStoresForCity(
  stateCode: string,
  citySlug: string,
): Promise<{ cityName: string; stores: StoreCard[] } | null> {
  const cities = await getCitiesForState(stateCode);
  const match = cities.find((c) => c.slug === citySlug);
  if (!match) return null;

  const pool = getPool();
  const { rows } = await pool.query(
    `select ${CARD_COLUMNS}
     from stores
     where ${CORE_FIELDS_OK} and state_code = $1 and city = $2
       and (category is null or category != all($3::text[]))`,
    [stateCode, match.city, IRRELEVANT_CATEGORIES],
  );
  return {
    cityName: match.city,
    stores: rows.map(toCard).sort((a, b) => {
      // enriched listings first, then by rating desc
      if (a.enrichmentStatus === "enriched" && b.enrichmentStatus !== "enriched") return -1;
      if (b.enrichmentStatus === "enriched" && a.enrichmentStatus !== "enriched") return 1;
      return (b.rating ?? 0) - (a.rating ?? 0);
    }),
  };
}

export async function getStoreById(id: number): Promise<StoreDetail | null> {
  const pool = getPool();
  const { rows } = await pool.query(
    `select id, name, city, state_code, category, subtypes, primary_specialty,
            rating, reviews, enrichment_status, enrichment_confidence, photo,
            address, street, postal_code, phone, website, latitude, longitude,
            working_hours, working_hours_csv_compatible, business_model,
            buys_antiques, buying_model, enriched_description, description,
            about_from_the_business_small_business, photos_count,
            enrichment_sources, enriched_at
     from stores
     where id = $1 and ${CORE_FIELDS_OK}`,
    [id],
  );
  if (rows.length === 0) return null;
  const row = rows[0];
  return {
    ...toCard(row),
    address: row.address ?? null,
    street: row.street ?? null,
    postalCode: row.postal_code ?? null,
    phone: row.phone ?? null,
    website: row.website ?? null,
    latitude: row.latitude !== null ? Number(row.latitude) : null,
    longitude: row.longitude !== null ? Number(row.longitude) : null,
    workingHours: row.working_hours ?? null,
    workingHoursCsv: row.working_hours_csv_compatible ?? null,
    subtypes: row.subtypes ?? null,
    enrichedDescription: row.enriched_description ?? null,
    description: row.description ?? null,
    enrichmentConfidence: row.enrichment_confidence ?? null,
    photosCount: row.photos_count ?? null,
    enrichmentSources: Array.isArray(row.enrichment_sources) && row.enrichment_sources.length > 0
      ? row.enrichment_sources
      : null,
  };
}

// Every (state, city) pair with at least one addressable store -- drives
// the sitemap's city-level entries without a per-state round trip.
export async function getAllCities(): Promise<
  { stateCode: string; city: string }[]
> {
  const pool = getPool();
  const { rows } = await pool.query(
    `select distinct state_code, city
     from stores
     where ${CORE_FIELDS_OK}
     order by state_code, city`,
  );
  return rows.map((r) => ({ stateCode: r.state_code, city: r.city }));
}

// Minimal fields for every addressable listing -- drives the sitemap's
// listing-level entries. Paged (ordered by id) so the sitemap can fetch
// fixed-size chunks rather than all ~35k rows at once.
export async function getAllStoreSlugs(
  opts: { offset?: number; limit?: number } = {},
): Promise<{ id: number; name: string; city: string; stateCode: string; updatedAt: Date }[]> {
  const pool = getPool();
  const { offset = 0, limit } = opts;
  const { rows } = await pool.query(
    `select id, name, city, state_code, updated_at
     from stores
     where ${CORE_FIELDS_OK}
     order by id
     ${limit !== undefined ? "limit $2 offset $1" : "offset $1"}`,
    limit !== undefined ? [offset, limit] : [offset],
  );
  return rows.map((r) => ({
    id: r.id as number,
    name: r.name as string,
    city: r.city as string,
    stateCode: r.state_code as string,
    updatedAt: r.updated_at as Date,
  }));
}

export async function getTotalStoreCount(): Promise<number> {
  const pool = getPool();
  const { rows } = await pool.query(
    `select count(*) as count from stores where ${CORE_FIELDS_OK}`,
  );
  return Number(rows[0].count);
}

// Full-text search across name/city/state/specialty/category. Computed
// on the fly (no persisted tsvector column or index) -- fine at this row
// count with no real traffic yet; add a generated column + GIN index per
// [[site_search_feature]] memory if this gets slow. State is matched by
// full name, not the two-letter code, so "Austin TX" won't match on the
// code today -- a known gap, not yet worth the complexity of also
// indexing state_code.
const SEARCH_VECTOR = `to_tsvector('english',
  coalesce(name,'') || ' ' || coalesce(city,'') || ' ' || coalesce(state,'') || ' ' ||
  coalesce(primary_specialty,'') || ' ' || coalesce(category,''))`;

export async function searchStores(
  query: string,
  opts: { limit?: number; buysOnly?: boolean } = {},
): Promise<StoreCard[]> {
  const q = query.trim();
  const { limit = 30, buysOnly = false } = opts;
  if (!q) return [];

  const pool = getPool();
  const { rows } = await pool.query(
    `select ${CARD_COLUMNS}
     from stores
     where ${CORE_FIELDS_OK}
       and ${SEARCH_VECTOR} @@ websearch_to_tsquery('english', $1)
       and (category is null or category != all($2::text[]))
       ${buysOnly ? "and buys_antiques = true" : ""}
     order by ts_rank(${SEARCH_VECTOR}, websearch_to_tsquery('english', $1)) desc,
              reviews desc nulls last
     limit $3`,
    [q, IRRELEVANT_CATEGORIES, limit],
  );
  return rows.map(toCard);
}

// For the homepage's "Find Buyers" entry point: confirmed outright
// buyers only, independent of any search term. Separate from
// `searchStores`'s `buysOnly` flag because this has no query to rank by.
export async function getConfirmedBuyers(limit = 30): Promise<StoreCard[]> {
  const pool = getPool();
  const { rows } = await pool.query(
    `select ${CARD_COLUMNS}
     from stores
     where ${CORE_FIELDS_OK} and buys_antiques = true
     order by reviews desc nulls last
     limit $1`,
    [limit],
  );
  return rows.map(toCard);
}

export type StateStats = {
  total: number;
  cityCount: number;
  buysOutrightCount: number;
};

// No `enrichedCount` here -- CORE_FIELDS_OK already restricts every query
// to enriched rows only, so it would always equal `total` and say nothing.
export async function getStateStats(stateCode: string): Promise<StateStats> {
  const pool = getPool();
  const { rows } = await pool.query(
    `select
       count(*) as total,
       count(distinct city) as city_count,
       count(*) filter (where buying_model = 'buys_outright') as buys_outright_count
     from stores
     where ${CORE_FIELDS_OK} and state_code = $1`,
    [stateCode],
  );
  const r = rows[0];
  return {
    total: Number(r.total),
    cityCount: Number(r.city_count),
    buysOutrightCount: Number(r.buys_outright_count),
  };
}

// Top categories in the state as Google's own scrape categorized them --
// "Antique store" is a catch-all, so this describes what's literally in
// the data, not a curated specialty taxonomy (that's the Phase 2 work).
export async function getStateCategoryBreakdown(
  stateCode: string,
  limit = 6,
): Promise<{ category: string; count: number }[]> {
  const pool = getPool();
  const { rows } = await pool.query(
    `select category, count(*) as count
     from stores
     where ${CORE_FIELDS_OK} and state_code = $1 and category is not null
     group by category
     order by count desc
     limit $2`,
    [stateCode, limit],
  );
  return rows.map((r) => ({ category: r.category as string, count: Number(r.count) }));
}

// Highest-rated stores, restricted to genuinely antique categories (not
// just anything rating-adjacent -- an earlier pass surfaced a movie-prop
// rental house and a Harley dealer here because they scored well in
// collectibles-adjacent categories despite their own enrichment saying
// outright they aren't antique stores). Returns [] rather than padding
// with lower-confidence picks when a state doesn't have enough that clear
// the bar -- several small states won't.
export async function getStateFeaturedStores(
  stateCode: string,
  limit = 6,
): Promise<StoreCard[]> {
  const pool = getPool();
  const { rows } = await pool.query(
    `select ${CARD_COLUMNS}
     from stores
     where ${CORE_FIELDS_OK} and state_code = $1
       and category in ('Antique store', 'Antique furniture store')
       and rating is not null and reviews >= 10
     order by rating desc, reviews desc
     limit $2`,
    [stateCode, limit],
  );
  return rows.map(toCard);
}

export type BuyingModelBreakdown = {
  buysOutright: number;
  consignmentOnly: number;
  checkedUnclear: number;
  neverChecked: number;
};

export async function getStateBuyingModelBreakdown(stateCode: string): Promise<BuyingModelBreakdown> {
  const pool = getPool();
  const { rows } = await pool.query(
    `select
       count(*) filter (where buying_model = 'buys_outright') as buys_outright,
       count(*) filter (where buying_model = 'consignment_vendor_booth') as consignment_only,
       count(*) filter (where buying_model = 'unclear') as checked_unclear,
       count(*) filter (where buying_model is null) as never_checked
     from stores
     where ${CORE_FIELDS_OK} and state_code = $1`,
    [stateCode],
  );
  const r = rows[0];
  return {
    buysOutright: Number(r.buys_outright),
    consignmentOnly: Number(r.consignment_only),
    checkedUnclear: Number(r.checked_unclear),
    neverChecked: Number(r.never_checked),
  };
}

// Curated allow-list for the home page's specialty teaser -- hand-picked
// to exclude categories that are common in the raw data but aren't
// actually antique/vintage-relevant (e.g. "Video game store", the
// lowercase "attractions" junk category). Counts are queried live, not
// hardcoded, so they stay accurate as the catalog grows.
const SPECIALTY_TEASER_CATEGORIES = [
  { category: "Antique store", label: "Antique Stores" },
  { category: "Collectibles store", label: "Collectibles Stores" },
  { category: "Antique furniture store", label: "Antique Furniture Stores" },
  { category: "Antique furniture restoration service", label: "Furniture Restoration" },
  { category: "Coin dealer", label: "Coin Dealers" },
  { category: "Vintage clothing store", label: "Vintage Clothing" },
];

export async function getSpecialtyTeaser(): Promise<
  { label: string; category: string; count: number }[]
> {
  const pool = getPool();
  const categories = SPECIALTY_TEASER_CATEGORIES.map((c) => c.category);
  const { rows } = await pool.query(
    `select category, count(*) as count
     from stores
     where ${CORE_FIELDS_OK} and category = any($1::text[])
     group by category`,
    [categories],
  );
  const countByCategory = new Map(rows.map((r) => [r.category as string, Number(r.count)]));
  return SPECIALTY_TEASER_CATEGORIES.map((c) => ({
    label: c.label,
    category: c.category,
    count: countByCategory.get(c.category) ?? 0,
  }));
}

// Most recently processed by the enrichment pipeline -- NOT "newly added
// to the directory". enriched_at has only 57 distinct values across the
// whole catalog (batch-run timestamps from a handful of pipeline runs),
// so this reflects which batch ran last, not per-store discovery dates.
// Framed as "Recently Updated" on the home page for exactly this reason.
export async function getRecentlyUpdated(limit = 3): Promise<StoreCard[]> {
  const pool = getPool();
  const { rows } = await pool.query(
    `select ${CARD_COLUMNS}
     from stores
     where ${CORE_FIELDS_OK} and enriched_at is not null
     order by enriched_at desc, id desc
     limit $1`,
    [limit],
  );
  return rows.map(toCard);
}
