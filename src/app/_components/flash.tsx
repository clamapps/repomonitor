export function Flash({
  notice,
  error,
}: {
  notice?: string;
  error?: string;
}) {
  if (!notice && !error) return null;
  return (
    <div className={`flash ${error ? "flash-error" : "flash-notice"}`} role="status">
      <span aria-hidden="true">{error ? "!" : "✓"}</span>
      <p>{error ?? notice}</p>
    </div>
  );
}
