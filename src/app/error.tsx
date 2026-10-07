'use client';
import Link from 'next/link';

export default function ErrorPage({ retry }: { retry: () => void }) {
  return (
    <main className="container py-5">
      <section className="card card-body p-4 mx-auto" style={{ maxWidth: 600 }}>
        <h1 className="h3">Unable to load this page</h1>
        <p role="alert">
          Something went wrong. Try again, or return to your workspace.
        </p>
        <div className="d-flex flex-wrap gap-3">
          <button className="btn btn-primary" onClick={retry}>
            Try again
          </button>
          <Link className="btn btn-outline-secondary" href="/">
            Go to workspace
          </Link>
        </div>
      </section>
    </main>
  );
}
