import type { StoreDetail } from "@/lib/stores";
import { getEvidence } from "@/lib/evidence";

// Renders nothing when there's no real evidence to disclose (per the
// design guidelines: automated extraction alone shouldn't produce a
// "Verified" seal, and a record inferred from the business name only has
// nothing to cite). "Website reviewed", never "Owner confirmed" -- we
// have no signal that would make the latter true.
export function EvidenceNote({ store }: { store: StoreDetail }) {
  const evidence = getEvidence(store);
  if (!evidence) return null;

  const date = evidence.checkedAt
    ? evidence.checkedAt.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })
    : null;

  return (
    <div className="evidence">
      Website reviewed{date ? ` ${date}` : ""} --{" "}
      <a href={evidence.sourceUrl} target="_blank" rel="noopener noreferrer nofollow">
        source
      </a>
    </div>
  );
}
