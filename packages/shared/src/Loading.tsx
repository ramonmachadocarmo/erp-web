export function Loading({ label = "Carregando..." }: { label?: string }) {
  return (
    <div className="loading" role="status" aria-live="polite">
      <span className="loading-spinner" />
      <span>{label}</span>
    </div>
  );
}
