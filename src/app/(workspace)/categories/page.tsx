import type { Metadata } from 'next';
import Link from 'next/link';
import { CategoryForm, DeleteCategory } from '@/components/category-form';
import { listCategories } from '@/lib/data/categories';

export const metadata: Metadata = {
  title: 'Categories | Personal Finance Tracker',
};
const notices: Record<string, string> = {
  created: 'Category created.',
  updated: 'Category updated.',
  deleted: 'Category deleted.',
};

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string; notice?: string }>;
}) {
  const query = await searchParams;
  const { data: categories, error } = await listCategories();
  const editing = categories?.find((category) => category.id === query.edit);
  return (
    <>
      <header className="page-heading">
        <p className="eyebrow">YOUR WORKSPACE</p>
        <h1>Categories</h1>
        <p className="text-secondary mb-0">
          Organize your income and expenses with categories that make sense to
          you.
        </p>
      </header>
      {query.notice && Object.hasOwn(notices, query.notice) && (
        <p role="status" className="alert alert-success">
          {notices[query.notice]}
        </p>
      )}
      {error ? (
        <div role="alert" className="alert alert-danger">
          Unable to load your categories.{' '}
          <Link href="/categories">Try again</Link>.
        </div>
      ) : (
        <>
          {query.edit && !editing && (
            <p role="alert" className="alert alert-warning">
              That category is unavailable. Choose a category from the list.
            </p>
          )}
          <div className="row g-4">
            <div className="col-12 col-xl-7">
              {!categories?.length ? (
                <section className="card">
                  <div className="card-body p-4">
                    <h2 className="h5">Add your first category</h2>
                    <p className="text-secondary mb-0">
                      Try Groceries, Housing, or Salary. Choose a type to
                      separate spending from income.
                    </p>
                  </div>
                </section>
              ) : (
                <div className="d-grid gap-3">
                  {categories.map((category) => (
                    <article className="card" key={category.id}>
                      <div className="card-body p-4">
                        <div className="d-flex justify-content-between align-items-start gap-3 flex-wrap">
                          <div className="text-break">
                            <h2 className="h5 mb-1">{category.name}</h2>
                            <span className="small text-secondary">
                              {category.kind === 'income'
                                ? 'Income'
                                : 'Expense'}
                            </span>
                            {category.archived && (
                              <span className="badge text-bg-secondary ms-2">
                                Archived
                              </span>
                            )}
                          </div>
                          <Link
                            href={`/categories?edit=${category.id}#category-form`}
                            className="btn btn-outline-primary btn-sm"
                            aria-label={`Edit ${category.name}`}
                          >
                            Edit
                          </Link>
                        </div>
                        <DeleteCategory category={category} />
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>
            <div className="col-12 col-xl-5">
              <CategoryForm
                key={editing?.id ?? `new-${categories?.length ?? 0}`}
                category={editing}
              />
            </div>
          </div>
        </>
      )}
    </>
  );
}
