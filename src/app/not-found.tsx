import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-16 text-center">
      <h1 className="text-2xl font-semibold text-stone-900">Page not found</h1>
      <p className="mt-2 text-stone-600">
        We couldn&apos;t find that listing, city, or state.
      </p>
      <Link href="/" className="mt-4 inline-block text-amber-800 hover:underline">
        Back to all states
      </Link>
    </div>
  );
}
