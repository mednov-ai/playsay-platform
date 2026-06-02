export function ThreadConnector({ compact = false }: { compact?: boolean }) {
  return (
    <span aria-hidden="true" className="relative min-h-full">
      <span className="absolute left-3 top-0 h-full w-px bg-border" />
      {!compact ? <span className="absolute left-3 top-5 h-px w-3 bg-border" /> : null}
    </span>
  );
}
