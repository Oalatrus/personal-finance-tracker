export default function Loading() {
  return (
    <div role="status" className="d-flex align-items-center gap-3 py-5">
      <span className="spinner-border text-primary" aria-hidden="true" />
      <span>Loading your workspace…</span>
    </div>
  );
}
