'use client';

import { useEffect } from 'react';
import Link from 'next/link';

export default function ExecutionsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Executions page error:', error);
  }, [error]);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-red-400">Failed to load executions</h1>
      <p className="text-zinc-400">{error.message}</p>
      <div className="flex gap-3">
        <button
          onClick={reset}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          Retry
        </button>
        <Link href="/" className="px-4 py-2 bg-zinc-800 text-white rounded hover:bg-zinc-700">
          Go to Dashboard
        </Link>
      </div>
    </div>
  );
}
