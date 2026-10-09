'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const links = [
  { href: '/', label: 'Overview', symbol: '◫' },
  { href: '/transactions', label: 'Transactions', symbol: '↔' },
  { href: '/accounts', label: 'Accounts', symbol: '▣' },
  { href: '/categories', label: 'Categories', symbol: '▦' },
  { href: '/budgets', label: 'Budgets', symbol: '◉' },
  { href: '/import', label: 'Import CSV', symbol: '↥' },
  { href: '/banks', label: 'Bank connections', symbol: '⇄' },
];

export function Navigation() {
  const pathname = usePathname();

  return (
    <aside className="workspace-sidebar">
      <Link href="/" className="brand">
        <span className="brand-mark" aria-hidden="true">
          ▥
        </span>
        <span>
          Personal finance
          <span className="brand-caption">A clearer picture.</span>
        </span>
      </Link>
      <p className="nav-heading">WORKSPACE</p>
      <nav aria-label="Main navigation" className="nav workspace-nav">
        {links.map(({ href, label, symbol }) => {
          const active =
            href === '/' ? pathname === '/' : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`nav-link${active ? ' active' : ''}`}
              aria-current={active ? 'page' : undefined}
            >
              <span className="nav-symbol" aria-hidden="true">
                {symbol}
              </span>
              {label}
            </Link>
          );
        })}
      </nav>
      <div className="sidebar-note">
        <span className="small fw-semibold">
          Built around your everyday money
        </span>
        <p className="small mb-0 mt-2">
          One place for your accounts, spending, and plans.
        </p>
      </div>
    </aside>
  );
}
