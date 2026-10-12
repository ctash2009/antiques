// Renders a JSON-LD <script> tag. JSON.stringify of our own server-built
// objects (no user input passed through raw) -- safe to inline directly.
export function JsonLd({ data }: { data: object }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
