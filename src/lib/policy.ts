export type Badge = { cls: "buys" | "notice" | "plain" | "unknown"; text: string };

// Minimal shape these functions need -- satisfied by both StoreCard (list
// rows) and StoreDetail (the full listing page), since buying-policy and
// store-format fields live on the base StoreCard type.
type PolicyFields = {
  buysAntiques: boolean | null;
  buyingModel: string | null;
  enrichmentStatus: string | null;
  businessModel: string | null;
  smallBusiness: boolean | null;
};

// Per antique-directory-design-guidelines.md section 5: buying arrangement
// and store format are separate dimensions, and arrangements can coexist
// in principle. The real schema only has a single categorical
// `buying_model` value per store (not a set), so true coexistence isn't
// representable yet -- this maps as faithfully as the data allows without
// inventing a split it doesn't support.
//
// "Buying policy unknown" is reserved for records that were actually
// enriched and still came back unclear -- a record that was never checked
// at all (enrichment_status null/insufficient_data) gets no policy badge
// here; the page's own "not yet researched" messaging covers that case so
// "unknown" doesn't get conflated with "never looked".
const BUYING_MODEL_LABEL: Record<string, string> = {
  buys_outright: "Buys Selected Items",
  consignment_vendor_booth: "Accepts Consignment / Vendor Booths",
};

export function buyingPolicyBadges(store: PolicyFields): Badge[] {
  if (store.buysAntiques === true) {
    const label = store.buyingModel ? BUYING_MODEL_LABEL[store.buyingModel] : null;
    return [{ cls: "buys", text: label ?? "Buys Selected Items" }];
  }
  if (store.buysAntiques === false) {
    return [{ cls: "plain", text: "Does Not Buy From The Public" }];
  }
  if (store.enrichmentStatus === "enriched" && store.buyingModel === "unclear") {
    return [{ cls: "unknown", text: "Buying Policy Unknown" }];
  }
  return [];
}

// Store format: a separate axis from buying policy (a multi-vendor mall's
// "vendor booths available" is about how the business is organized, not
// whether it personally buys from the public).
const FORMAT_LABEL: Record<string, string> = {
  single_dealer: "Single Dealer",
  single_dealor: "Single Dealer", // data-entry typo seen in a handful of rows
  multi_vendor_mall: "Vendor Booths Available",
};

export function storeFormatBadges(store: PolicyFields): Badge[] {
  const badges: Badge[] = [];
  if (store.businessModel === "appointment_only_showroom") {
    badges.push({ cls: "notice", text: "Appointment Only" });
  } else if (store.businessModel && FORMAT_LABEL[store.businessModel]) {
    badges.push({ cls: "plain", text: FORMAT_LABEL[store.businessModel] });
  }
  if (store.smallBusiness === true) {
    badges.push({ cls: "plain", text: "Small Business" });
  }
  return badges;
}

export function isAppointmentOnly(store: Pick<PolicyFields, "businessModel">): boolean {
  return store.businessModel === "appointment_only_showroom";
}

// A readable research-status badge for records that don't have real
// policy/format data to show -- never silence. `null` (never processed),
// 'insufficient_data' (processed, found too little to say anything), and
// 'failed' (the enrichment step itself errored) are three different real
// states and get three different messages; returns null for 'enriched',
// where the policy/format badges already speak for themselves.
export function researchStatusBadge(enrichmentStatus: string | null): Badge | null {
  if (enrichmentStatus === "enriched") return null;
  if (enrichmentStatus === "insufficient_data") {
    return { cls: "unknown", text: "Limited Information Available" };
  }
  if (enrichmentStatus === "failed") {
    return { cls: "unknown", text: "Research Incomplete" };
  }
  return { cls: "unknown", text: "Not Yet Researched" };
}
