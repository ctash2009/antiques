import { getPool } from "./db";
import { slugify } from "./geo";

// Only rows with the core fields a page needs to render are addressable.
// (16 of 34,928 rows are missing name/city/state_code -- bad scrapes with
// nothing to show; excluded everywhere via this clause.)
const CORE_FIELDS_OK = `name is not null and city is not null and state_code is not null`;

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
  subtypes: string | null;
  businessModel: string | null;
  buysAntiques: boolean | null;
  buyingModel: string | null;
  enrichedDescription: string | null;
  description: string | null;
  enrichmentConfidence: string | null;
};

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
    `select id, name, city, state_code, category, primary_specialty,
            rating, reviews, enrichment_status, photo
     from stores
     where ${CORE_FIELDS_OK} and state_code = $1 and city = $2`,
    [stateCode, match.city],
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
            working_hours, business_model, buys_antiques, buying_model,
            enriched_description, description
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
    subtypes: row.subtypes ?? null,
    businessModel: row.business_model ?? null,
    buysAntiques: row.buys_antiques ?? null,
    buyingModel: row.buying_model ?? null,
    enrichedDescription: row.enriched_description ?? null,
    description: row.description ?? null,
    enrichmentConfidence: row.enrichment_confidence ?? null,
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
// listing-level entries.
export async function getAllStoreSlugs(): Promise<
  { id: number; name: string; city: string; stateCode: string; updatedAt: Date }[]
> {
  const pool = getPool();
  const { rows } = await pool.query(
    `select id, name, city, state_code, updated_at
     from stores
     where ${CORE_FIELDS_OK}`,
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
