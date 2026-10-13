import type { Badge } from "@/lib/policy";

export function Badges({ badges }: { badges: Badge[] }) {
  if (badges.length === 0) return null;
  return (
    <div className="badges">
      {badges.map((b, i) => (
        <span key={i} className={`badge ${b.cls}`}>
          {b.text}
        </span>
      ))}
    </div>
  );
}
