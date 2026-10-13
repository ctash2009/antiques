// Per the guidelines: empty results need a concrete next action, never
// fabricated listings to fill the space.
export function EmptyState({
  message,
  action,
}: {
  message: string;
  action?: { href: string; label: string };
}) {
  return (
    <div
      style={{
        marginTop: "var(--space-6)",
        padding: "var(--space-6)",
        background: "var(--color-surface)",
        border: "1px solid var(--color-border)",
        borderRadius: "var(--radius-card)",
        color: "var(--color-text-muted)",
      }}
    >
      <p>{message}</p>
      {action && (
        <a href={action.href} className="btn btn-secondary" style={{ marginTop: "var(--space-4)" }}>
          {action.label}
        </a>
      )}
    </div>
  );
}
