'use client';

import { useState, useEffect } from 'react';
import { Nav } from '@/components/Nav';
import type { SavingsData, DriftEvent, ProjectSync } from '@/lib/types';

export default function SavingsPage() {
  const [data, setData] = useState<SavingsData | null>(null);
  const [hourlyRate, setHourlyRate] = useState(150);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/savings')
      .then(async res => {
        if (res.ok) {
          const responseData = await res.json();
          if (!responseData.error) {
            setData(responseData);
          }
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const monthlySavings = data ? data.hoursSaved * hourlyRate : 0;
  const annualSavings = monthlySavings * 12;

  return (
    <main className="min-h-screen bg-[#0a0a0a] text-white">
      <Nav />
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">Savings Dashboard</h1>
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-400">Rate: $</label>
            <input
              type="number"
              value={hourlyRate}
              onChange={e => setHourlyRate(Number(e.target.value) || 150)}
              className="w-20 px-2 py-1 bg-gray-800 border border-gray-700 rounded text-sm"
            />
            <span className="text-sm text-gray-400">/hr</span>
          </div>
        </div>

        {loading ? (
          <p className="text-gray-400">Loading savings data...</p>
        ) : !data ? (
          <p className="text-gray-400">No data available.</p>
        ) : (
          <>
            {/* Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
              <div className="bg-gray-900 border border-gray-700 rounded-lg p-4">
                <p className="text-2xl font-bold">{data.filesManaged}</p>
                <p className="text-xs text-gray-400">Files Managed</p>
              </div>
              <div className="bg-gray-900 border border-gray-700 rounded-lg p-4">
                <p className="text-2xl font-bold">{data.projectsManaged}</p>
                <p className="text-xs text-gray-400">Projects</p>
              </div>
              <div className="bg-gray-900 border border-gray-700 rounded-lg p-4">
                <p className="text-2xl font-bold text-blue-400">{data.syncEvents}</p>
                <p className="text-xs text-gray-400">Sync Events</p>
              </div>
              <div className="bg-gray-900 border border-gray-700 rounded-lg p-4">
                <p className="text-2xl font-bold text-yellow-400">{data.driftPrevented}</p>
                <p className="text-xs text-gray-400">Drift Prevented</p>
              </div>
              <div className="bg-gray-900 border border-gray-700 rounded-lg p-4">
                <p className="text-2xl font-bold text-green-400">{data.secretsProtected}</p>
                <p className="text-xs text-gray-400">Secrets Protected</p>
              </div>
              <div className="bg-gray-900 border border-gray-700 rounded-lg p-4">
                <p className="text-2xl font-bold text-purple-400">{data.hoursSaved.toFixed(0)}h</p>
                <p className="text-xs text-gray-400">Hours Saved/Mo</p>
              </div>
            </div>

            {/* ROI Summary */}
            <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-6 mb-8">
              <h2 className="text-lg font-semibold text-green-400 mb-4">ROI Summary</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                <div>
                  <p className="text-sm text-gray-400">Monthly Savings</p>
                  <p className="text-2xl font-bold text-green-400">${monthlySavings.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-400">Annual Projection</p>
                  <p className="text-2xl font-bold text-green-400">${annualSavings.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-400">midex Cost</p>
                  <p className="text-2xl font-bold">$0</p>
                  <p className="text-xs text-gray-500">Self-hosted</p>
                </div>
                <div>
                  <p className="text-sm text-gray-400">Net Annual Value</p>
                  <p className="text-2xl font-bold text-green-400">${annualSavings.toLocaleString()}</p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Project Sync Status */}
              <div className="bg-gray-900 border border-gray-700 rounded-lg p-4">
                <h2 className="text-lg font-semibold mb-4">Project Sync Status</h2>
                {data.projectSyncStatus.length === 0 ? (
                  <p className="text-gray-400 text-sm">No projects tracked yet.</p>
                ) : (
                  <div className="space-y-2">
                    {data.projectSyncStatus.map(project => (
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

              {/* Drift Events */}
              <div className="bg-gray-900 border border-gray-700 rounded-lg p-4">
                <h2 className="text-lg font-semibold mb-4">Recent Drift Events</h2>
                {data.driftEvents.length === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-green-400 font-medium">No drift detected</p>
                    <p className="text-xs text-gray-500 mt-1">All configs in sync</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {data.driftEvents.slice(0, 5).map(event => (
                      <div
                        key={event.id}
                        className="flex items-center justify-between p-3 bg-gray-800 rounded"
                      >
                        <div>
                          <p className="font-medium text-sm">{event.file}</p>
                          <p className="text-xs text-gray-400">{event.project}</p>
                        </div>
                        <div className="text-right">
                          <span
                            className={`px-2 py-1 rounded text-xs font-medium ${
                              event.status === 'resolved'
                                ? 'bg-green-500/20 text-green-400'
                                : 'bg-red-500/20 text-red-400'
                            }`}
                          >
                            {event.status}
                          </span>
                          <p className="text-xs text-gray-500 mt-1">
                            {new Date(event.detected_at).toLocaleString()}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Value Comparison Table */}
            <div className="mt-8 bg-gray-900 border border-gray-700 rounded-lg p-6">
              <h2 className="text-lg font-semibold mb-4">Traditional vs midex</h2>
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
                    <td className="py-3">New rule rollout (15 repos)</td>
                    <td className="py-3 text-gray-400">2-4 hours</td>
                    <td className="py-3 text-green-400">Instant</td>
                    <td className="py-3 text-right text-green-400">~3 hours</td>
                  </tr>
                  <tr className="border-t border-gray-800">
                    <td className="py-3">Developer onboarding</td>
                    <td className="py-3 text-gray-400">6-14 hours</td>
                    <td className="py-3 text-green-400">15 min</td>
                    <td className="py-3 text-right text-green-400">~10 hours</td>
                  </tr>
                  <tr className="border-t border-gray-800">
                    <td className="py-3">Security audit prep</td>
                    <td className="py-3 text-gray-400">40+ hours</td>
                    <td className="py-3 text-green-400">Instant</td>
                    <td className="py-3 text-right text-green-400">~40 hours</td>
                  </tr>
                  <tr className="border-t border-gray-800">
                    <td className="py-3">Secret leak incident</td>
                    <td className="py-3 text-gray-400">$50K-500K+</td>
                    <td className="py-3 text-green-400">$0 (prevented)</td>
                    <td className="py-3 text-right text-green-400">Priceless</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
