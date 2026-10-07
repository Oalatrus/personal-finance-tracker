import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="container py-5">
      <section className="card card-body p-4 mx-auto" style={{ maxWidth: 600 }}>
        <h1 className="h3">Page not found</h1>
        <p>The address may have changed or the page does not exist.</p>
        <Link href="/" className="btn btn-primary align-self-start">
          Go to workspace
        </Link>
      </section>
    </main>
  );
}
