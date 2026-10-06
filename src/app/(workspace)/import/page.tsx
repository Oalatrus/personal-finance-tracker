import type { Metadata } from 'next';
import Link from 'next/link';
import { listAccounts } from '@/lib/data/accounts';
import { listCategories } from '@/lib/data/categories';
import { CsvImport } from '@/components/csv-import';

export const metadata: Metadata = {
  title: 'Import CSV | Personal Finance Tracker',
};
export default async function Page() {
  const [accounts, categories] = await Promise.all([
    listAccounts(),
    listCategories(),
  ]);
  return (
    <>
      <header className="page-heading">
        <p className="eyebrow">YOUR WORKSPACE</p>
        <h1>Import CSV</h1>
        <p className="text-secondary mb-0">
          Review your bank export before adding transactions.
        </p>
      </header>
      {accounts.error || categories.error ? (
        <p role="alert" className="alert alert-danger">
          Unable to load import details. <Link href="/import">Try again</Link>.
        </p>
      ) : (
        <CsvImport
          accounts={accounts.data ?? []}
          categories={categories.data ?? []}
        />
      )}
    </>
  );
}
