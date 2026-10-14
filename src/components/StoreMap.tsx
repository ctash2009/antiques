// Free, keyless embed (google.com/maps?...&output=embed) -- no Google Cloud
// account or billing needed, works today with lat/long we already have.
// Worth knowing: this is the same class of undocumented/unofficial Google
// URL pattern that just broke every photo in the catalog (see
// [[photo_hosting]] memory) -- Google doesn't guarantee this embed form
// stays stable. The durable alternative is the official Maps Embed API
// (maps/embed/v1/place), which needs an API key from Google Cloud Console
// -- a real account-gated step, not something to set up unilaterally.
export function StoreMap({ latitude, longitude, name }: { latitude: number; longitude: number; name: string }) {
  const src = `https://www.google.com/maps?q=${latitude},${longitude}(${encodeURIComponent(name)})&z=15&output=embed`;
  return (
    <iframe
      src={src}
      title={`Map showing ${name}`}
      loading="lazy"
      style={{ width: "100%", height: "160px", border: "none", display: "block" }}
    />
  );
}
