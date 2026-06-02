export function MaterialAccessMessage({ message }: { message: string }) {
  return (
    <div className="mt-4 rounded-2xl border border-border bg-muted/70 p-4 text-sm font-semibold text-muted-foreground">
      {message}
    </div>
  );
}
