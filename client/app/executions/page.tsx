'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { ExecutionRow, ExecutionState } from '@/lib/types';
import { formatDurationMs } from '@/lib/utils';

const STATES: Array<'all' | ExecutionState> = ['all', 'running', 'completed', 'failed', 'idle', 'paused', 'abandoned', 'diverged'];

export default function ExecutionsPage() {
  const [executions, setExecutions] = useState<ExecutionRow[]>([]);
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);

  const fetchExecutions = async () => {
    try {
      const params = new URLSearchParams({ limit: '50' });
      if (filter !== 'all') params.set('state', filter);

      const res = await fetch(`/api/executions?${params}`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          setExecutions(data);
        }
      }
    } catch (err) {
      console.error('Failed to fetch:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    fetchExecutions();
  }, [filter]);

  useEffect(() => {
    const interval = setInterval(fetchExecutions, 5000);
    return () => clearInterval(interval);
  }, [filter]);

  const formatTime = (iso: string) => {
    return new Date(iso).toLocaleString();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Executions</h1>
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="bg-zinc-900 border border-zinc-700 rounded px-3 py-1.5 text-sm"
        >
          {STATES.map((state) => (
            <option key={state} value={state}>
              {state === 'all' ? 'All States' : state}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="text-zinc-500">Loading...</div>
      ) : (
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-zinc-800">
              <tr>
                <th className="text-left px-4 py-2 font-medium text-zinc-400">Execution ID</th>
                <th className="text-left px-4 py-2 font-medium text-zinc-400">Workflow</th>
                <th className="text-left px-4 py-2 font-medium text-zinc-400">State</th>
                <th className="text-left px-4 py-2 font-medium text-zinc-400">Current Step</th>
                <th className="text-left px-4 py-2 font-medium text-zinc-400">Started</th>
                <th className="text-left px-4 py-2 font-medium text-zinc-400">Duration</th>
              </tr>
            </thead>
            <tbody>
              {executions.map((exec) => (
                <tr key={exec.execution_id} className="border-t border-zinc-800 hover:bg-zinc-800/50">
                  <td className="px-4 py-2">
                    <Link href={`/executions/${exec.execution_id}`} className="text-blue-400 hover:underline font-mono text-xs">
                      {exec.execution_id}
                    </Link>
                  </td>
                  <td className="px-4 py-2">{exec.workflow_name}</td>
                  <td className="px-4 py-2">
                    <span className={`badge badge-${exec.state}`}>{exec.state}</span>
                  </td>
                  <td className="px-4 py-2 text-zinc-400">{exec.current_step || '-'}</td>
                  <td className="px-4 py-2 text-zinc-400">{formatTime(exec.started_at)}</td>
                  <td className="px-4 py-2 text-zinc-400">{formatDurationMs(exec.duration_ms)}</td>
                </tr>
              ))}
              {executions.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-zinc-500">
                    No executions found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
