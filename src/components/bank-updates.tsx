'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { automaticBankUpdates } from '@/app/(workspace)/banks/actions';

export function BankUpdates() {
  const router = useRouter();
  const running = useRef(false);
  const version = useRef<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'updating' | 'error'>('idle');
  useEffect(() => {
    let mounted = true;
    const check = async () => {
      if (
        running.current ||
        document.visibilityState !== 'visible' ||
        !navigator.onLine
      )
        return;
      running.current = true;
      setStatus('updating');
      try {
        const result = await automaticBankUpdates();
        if (!mounted) return;
        setStatus(result.error ? 'error' : 'idle');
        if (
          result.checked ||
          (result.version && version.current !== result.version)
        )
          router.refresh();
        version.current = result.version;
      } catch {
        if (mounted) setStatus('error');
      } finally {
        running.current = false;
      }
    };
    void check();
    const timer = window.setInterval(() => void check(), 60_000);
    document.addEventListener('visibilitychange', check);
    window.addEventListener('online', check);
    return () => {
      mounted = false;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', check);
      window.removeEventListener('online', check);
    };
  }, [router]);
  return (
    <span className="small text-secondary" role="status" aria-live="polite">
      {status === 'updating' ? (
        'Updating bank transactions…'
      ) : status === 'error' ? (
        <Link href="/banks">Bank updates need attention</Link>
      ) : null}
    </span>
  );
}
