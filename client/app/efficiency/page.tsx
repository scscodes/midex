'use client';

import { useState, useEffect } from 'react';
import { Nav } from '@/components/Nav';
import { formatDuration } from '@/lib/utils';
import type { WorkflowEfficiency } from '@/lib/types';

export default function EfficiencyPage() {
  const [workflows, setWorkflows] = useState<WorkflowEfficiency[]>([]);
  const [hourlyRate, setHourlyRate] = useState(150);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/efficiency')
      .then(res => res.json())
      .then(data => {
        setWorkflows(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const recalculate = (data: WorkflowEfficiency[]) => {
    return data.map(w => ({
      ...w,
      savedDollars: w.savedHours * hourlyRate,
    }));
  };

  const displayWorkflows = recalculate(workflows);

  const totals = displayWorkflows.reduce(
    (acc, w) => ({
      totalRuns: acc.totalRuns + w.total,
      totalCompleted: acc.totalCompleted + w.completed,
      totalSavedHours: acc.totalSavedHours + w.savedHours,
      totalSavedDollars: acc.totalSavedDollars + w.savedDollars,
    }),
    { totalRuns: 0, totalCompleted: 0, totalSavedHours: 0, totalSavedDollars: 0 }
  );

  return (
    <main className="min-h-screen bg-[#0a0a0a] text-white">
      <Nav />
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">Workflow Efficiency</h1>
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-400">Hourly rate: $</label>
            <input
              type="number"
              value={hourlyRate}
              onChange={e => setHourlyRate(Number(e.target.value) || 150)}
              className="w-20 px-2 py-1 bg-gray-800 border border-gray-700 rounded text-sm"
            />
          </div>
        </div>

        {loading ? (
          <p className="text-gray-400">Loading efficiency data...</p>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
              <div className="bg-gray-900 border border-gray-700 rounded-lg p-4">
                <p className="text-3xl font-bold">{totals.totalRuns}</p>
                <p className="text-sm text-gray-400">Total Executions</p>
              </div>
              <div className="bg-gray-900 border border-gray-700 rounded-lg p-4">
                <p className="text-3xl font-bold text-green-400">{totals.totalCompleted}</p>
                <p className="text-sm text-gray-400">Completed</p>
              </div>
              <div className="bg-gray-900 border border-gray-700 rounded-lg p-4">
                <p className="text-3xl font-bold text-blue-400">{totals.totalSavedHours.toFixed(1)}h</p>
                <p className="text-sm text-gray-400">Hours Saved</p>
              </div>
              <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4">
                <p className="text-3xl font-bold text-green-400">${totals.totalSavedDollars.toLocaleString()}</p>
                <p className="text-sm text-gray-400">Value Generated</p>
              </div>
            </div>

            <div className="bg-gray-900 border border-gray-700 rounded-lg overflow-hidden">
              <table className="w-full">
                <thead className="bg-gray-800">
                  <tr>
                    <th className="text-left px-4 py-3 text-sm font-medium text-gray-400">Workflow</th>
                    <th className="text-right px-4 py-3 text-sm font-medium text-gray-400">Runs</th>
                    <th className="text-right px-4 py-3 text-sm font-medium text-gray-400">Avg Time</th>
                    <th className="text-right px-4 py-3 text-sm font-medium text-gray-400">Manual Equiv.</th>
                    <th className="text-right px-4 py-3 text-sm font-medium text-gray-400">Hours Saved</th>
                    <th className="text-right px-4 py-3 text-sm font-medium text-gray-400">Value</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {displayWorkflows.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                        No workflow data available yet.
                      </td>
                    </tr>
                  ) : (
                    displayWorkflows.map(w => (
                      <tr key={w.name} className="hover:bg-gray-800/50">
                        <td className="px-4 py-3">
                          <p className="font-medium">{w.name}</p>
                          <p className="text-xs text-gray-500 truncate max-w-xs">{w.description}</p>
                        </td>
                        <td className="px-4 py-3 text-right">{w.completed}</td>
                        <td className="px-4 py-3 text-right text-gray-400">
                          {w.avgDuration < 60
                            ? `${Math.round(w.avgDuration)}s`
                            : `${Math.round(w.avgDuration / 60)}m`}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-400">{w.manualEquivalent}m</td>
                        <td className="px-4 py-3 text-right text-blue-400">{w.savedHours.toFixed(1)}h</td>
                        <td className="px-4 py-3 text-right text-green-400">
                          ${w.savedDollars.toLocaleString()}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
