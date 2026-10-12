import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-20 text-center">
      <h1 className="text-2xl font-semibold text-stone-900">Page not found</h1>
      <p className="mt-2 text-stone-600">
        We couldn&apos;t find that state, city, or store listing.
      </p>
      <Link href="/" className="mt-6 inline-block text-stone-700 hover:underline">
        Back to all states
      </Link>
    </div>
  );
}
