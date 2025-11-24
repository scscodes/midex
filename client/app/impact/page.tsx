'use client';

import { useState, useEffect } from 'react';
import type { WorkflowEfficiency, SavingsData } from '@/lib/types';

export default function ImpactPage() {
  const [workflows, setWorkflows] = useState<WorkflowEfficiency[]>([]);
  const [savingsData, setSavingsData] = useState<SavingsData | null>(null);
  const [hourlyRate, setHourlyRate] = useState(150);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch('/api/efficiency').then(r => r.ok ? r.json() : []),
      fetch('/api/savings').then(r => r.ok ? r.json() : null),
    ])
      .then(([efficiencyData, savingsDataRes]) => {
        if (Array.isArray(efficiencyData)) setWorkflows(efficiencyData);
        if (savingsDataRes && !savingsDataRes.error) setSavingsData(savingsDataRes);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const recalculate = (data: WorkflowEfficiency[]) => {
    return data.map(w => ({
      ...w,
      savedDollars: w.savedHours * hourlyRate,
    }));
  };

  const displayWorkflows = recalculate(workflows);

  const workflowTotals = displayWorkflows.reduce(
    (acc, w) => ({
      totalRuns: acc.totalRuns + w.total,
      totalCompleted: acc.totalCompleted + w.completed,
      totalSavedHours: acc.totalSavedHours + w.savedHours,
      totalSavedDollars: acc.totalSavedDollars + w.savedDollars,
    }),
    { totalRuns: 0, totalCompleted: 0, totalSavedHours: 0, totalSavedDollars: 0 }
  );

  const configSavings = savingsData ? savingsData.hoursSaved * hourlyRate : 0;
  const totalSavedHours = workflowTotals.totalSavedHours + (savingsData?.hoursSaved || 0);
  const totalValue = workflowTotals.totalSavedDollars + configSavings;
  const annualProjection = totalValue * 12;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Impact Dashboard</h1>
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
        <p className="text-gray-400">Loading impact data...</p>
      ) : (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <div className="bg-gray-900 border border-gray-700 rounded-lg p-4">
              <p className="text-3xl font-bold">{workflowTotals.totalCompleted}</p>
              <p className="text-sm text-gray-400">Workflows Completed</p>
            </div>
            <div className="bg-gray-900 border border-gray-700 rounded-lg p-4">
              <p className="text-3xl font-bold text-blue-400">{totalSavedHours.toFixed(1)}h</p>
              <p className="text-sm text-gray-400">Total Hours Saved</p>
            </div>
            <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4">
              <p className="text-3xl font-bold text-green-400">${totalValue.toLocaleString()}</p>
              <p className="text-sm text-gray-400">Monthly Value</p>
            </div>
            <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4">
              <p className="text-3xl font-bold text-green-400">${annualProjection.toLocaleString()}</p>
              <p className="text-sm text-gray-400">Annual Projection</p>
            </div>
          </div>

          {/* Workflow Efficiency */}
          <div className="bg-gray-900 border border-gray-700 rounded-lg overflow-hidden">
            <div className="px-4 py-3 bg-gray-800 border-b border-gray-700">
              <h2 className="text-lg font-semibold">Workflow Execution Efficiency</h2>
            </div>
            <table className="w-full">
              <thead className="bg-gray-800/50">
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
                      No workflow execution data yet.
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

          {/* Configuration Management Impact */}
          {savingsData && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-gray-900 border border-gray-700 rounded-lg p-4">
                <h2 className="text-lg font-semibold mb-4">Configuration Management</h2>
                <div className="grid grid-cols-2 gap-4 mb-6">
                  <div className="bg-gray-800 rounded p-3">
                    <p className="text-2xl font-bold">{savingsData.filesManaged}</p>
                    <p className="text-xs text-gray-400">Files Managed</p>
                  </div>
                  <div className="bg-gray-800 rounded p-3">
                    <p className="text-2xl font-bold">{savingsData.projectsManaged}</p>
                    <p className="text-xs text-gray-400">Projects</p>
                  </div>
                  <div className="bg-gray-800 rounded p-3">
                    <p className="text-2xl font-bold text-blue-400">{savingsData.syncEvents}</p>
                    <p className="text-xs text-gray-400">Sync Events</p>
                  </div>
                  <div className="bg-gray-800 rounded p-3">
                    <p className="text-2xl font-bold text-yellow-400">{savingsData.driftPrevented}</p>
                    <p className="text-xs text-gray-400">Drift Prevented</p>
                  </div>
                  <div className="bg-gray-800 rounded p-3">
                    <p className="text-2xl font-bold text-green-400">{savingsData.secretsProtected}</p>
                    <p className="text-xs text-gray-400">Secrets Protected</p>
                  </div>
                  <div className="bg-gray-800 rounded p-3">
                    <p className="text-2xl font-bold text-purple-400">{savingsData.hoursSaved.toFixed(0)}h</p>
                    <p className="text-xs text-gray-400">Hours Saved/Mo</p>
                  </div>
                </div>
                <div className="bg-green-500/10 border border-green-500/30 rounded p-4">
                  <p className="text-sm text-gray-400">Monthly Config Value</p>
                  <p className="text-2xl font-bold text-green-400">${configSavings.toLocaleString()}</p>
                </div>
              </div>

              <div className="bg-gray-900 border border-gray-700 rounded-lg p-4">
                <h2 className="text-lg font-semibold mb-4">Project Sync Status</h2>
                {savingsData.projectSyncStatus.length === 0 ? (
                  <p className="text-gray-400 text-sm">No projects tracked yet.</p>
                ) : (
                  <div className="space-y-2">
                    {savingsData.projectSyncStatus.map(project => (
                      <div
                        key={project.name}
                        className="flex items-center justify-between p-3 bg-gray-800 rounded"
                      >
                        <div>
                          <p className="font-medium">{project.name}</p>
                          <p className="text-xs text-gray-400">{project.configCount} configs</p>
                        </div>
                        <div className="text-right">
                          <span
                            className={`px-2 py-1 rounded text-xs font-medium ${
                              project.status === 'synced'
                                ? 'bg-green-500/20 text-green-400'
                                : project.status === 'stale'
                                ? 'bg-yellow-500/20 text-yellow-400'
                                : 'bg-red-500/20 text-red-400'
                            }`}
                          >
                            {project.status}
                          </span>
                          <p className="text-xs text-gray-500 mt-1">
                            {new Date(project.lastSync).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Value Comparison */}
          <div className="bg-gray-900 border border-gray-700 rounded-lg p-6">
            <h2 className="text-lg font-semibold mb-4">Traditional vs Automated Approach</h2>
            <table className="w-full">
              <thead>
                <tr className="text-left text-sm text-gray-400">
                  <th className="pb-3">Scenario</th>
                  <th className="pb-3">Traditional</th>
                  <th className="pb-3">With midex</th>
                  <th className="pb-3 text-right">Savings</th>
                </tr>
              </thead>
              <tbody className="text-sm">
                <tr className="border-t border-gray-800">
                  <td className="py-3">Config setup (per project)</td>
                  <td className="py-3 text-gray-400">4-8 hours</td>
                  <td className="py-3 text-green-400">15 min</td>
                  <td className="py-3 text-right text-green-400">~7 hours</td>
                </tr>
                <tr className="border-t border-gray-800">
                  <td className="py-3">Code review process</td>
                  <td className="py-3 text-gray-400">2-4 hours</td>
                  <td className="py-3 text-green-400">5-15 min</td>
                  <td className="py-3 text-right text-green-400">~3 hours</td>
                </tr>
                <tr className="border-t border-gray-800">
                  <td className="py-3">Documentation updates</td>
                  <td className="py-3 text-gray-400">3-6 hours</td>
                  <td className="py-3 text-green-400">10-20 min</td>
                  <td className="py-3 text-right text-green-400">~5 hours</td>
                </tr>
                <tr className="border-t border-gray-800">
                  <td className="py-3">Security audit prep</td>
                  <td className="py-3 text-gray-400">40+ hours</td>
                  <td className="py-3 text-green-400">Instant</td>
                  <td className="py-3 text-right text-green-400">~40 hours</td>
                </tr>
                <tr className="border-t border-gray-800">
                  <td className="py-3">Bug investigation & fix</td>
                  <td className="py-3 text-gray-400">4-12 hours</td>
                  <td className="py-3 text-green-400">30-60 min</td>
                  <td className="py-3 text-right text-green-400">~8 hours</td>
                </tr>
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
