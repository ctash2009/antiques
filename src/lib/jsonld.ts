import type { StoreCard, StoreDetail } from "./stores";
import { parseWorkingHoursCsv } from "./hours";
import { getSiteUrl } from "./site";
import { slugify, stateByCode } from "./geo";

export function breadcrumbJsonLd(items: { name: string; path: string }[]) {
  const base = getSiteUrl();
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      item: `${base}${item.path}`,
    })),
  };
}

// A lightweight ItemList for a city's store listing -- links out to each
// store's own page rather than duplicating full Store entities, since each
// one already carries its own JSON-LD on its detail page.
export function storeListJsonLd(stores: StoreCard[], cityName: string, stateCode: string) {
  const base = getSiteUrl();
  const state = stateByCode(stateCode);
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: `Antique Stores in ${cityName}, ${stateCode}`,
    itemListElement: stores.map((s, i) => ({
      "@type": "ListItem",
      position: i + 1,
      url: `${base}/${state?.slug ?? stateCode.toLowerCase()}/${slugify(cityName)}/${s.slug}`,
      name: s.name,
    })),
  };
}

export function storeJsonLd(store: StoreDetail, pageUrl: string) {
  const openingHours = parseWorkingHoursCsv(store.workingHoursCsv);

  const json: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Store",
    "@id": pageUrl,
    url: pageUrl,
    name: store.name,
  };

  if (store.enrichedDescription || store.description) {
    json.description = store.enrichedDescription ?? store.description;
  }
  if (store.photo) json.image = store.photo;
  if (store.phone) json.telephone = store.phone;
  if (store.website) json.sameAs = store.website;

  if (store.street || store.city) {
    const state = stateByCode(store.stateCode);
    json.address = {
      "@type": "PostalAddress",
      streetAddress: store.street ?? undefined,
      addressLocality: store.city,
      addressRegion: state?.code ?? store.stateCode,
      postalCode: store.postalCode ?? undefined,
      addressCountry: "US",
    };
  }

  if (store.latitude !== null && store.longitude !== null) {
    json.geo = {
      "@type": "GeoCoordinates",
      latitude: store.latitude,
      longitude: store.longitude,
    };
  }

  if (store.rating !== null && store.reviews !== null && store.reviews > 0) {
    json.aggregateRating = {
      "@type": "AggregateRating",
      ratingValue: store.rating,
      reviewCount: store.reviews,
    };
  }

  if (openingHours.length > 0) {
    json.openingHoursSpecification = openingHours.map((h) => ({
      "@type": "OpeningHoursSpecification",
      dayOfWeek: h.dayOfWeek,
      opens: h.opens,
      closes: h.closes,
    }));
  }

  return json;
}
