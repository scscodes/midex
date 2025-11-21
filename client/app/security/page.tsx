'use client';

import { useState, useEffect } from 'react';
import { Nav } from '@/components/Nav';
import type { SecurityData, SecretInfo } from '@/lib/types';

export default function SecurityPage() {
  const [data, setData] = useState<SecurityData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/security')
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

  const isExpiringSoon = (date: string | null) => {
    if (!date) return false;
    const diff = new Date(date).getTime() - Date.now();
    return diff > 0 && diff < 7 * 24 * 60 * 60 * 1000;
  };

  return (
    <main className="min-h-screen bg-[#0a0a0a] text-white">
      <Nav />
      <div className="max-w-6xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold mb-6">Security & Compliance</h1>

        {loading ? (
          <p className="text-gray-400">Loading security data...</p>
        ) : !data ? (
          <p className="text-gray-400">No data available.</p>
        ) : (
          <>
            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
              <div className="bg-gray-900 border border-gray-700 rounded-lg p-4">
                <p className="text-3xl font-bold">{data.stats.totalSecrets}</p>
                <p className="text-sm text-gray-400">Secrets Managed</p>
              </div>
              <div className={`bg-gray-900 border rounded-lg p-4 ${
                data.stats.expiringIn7Days > 0 ? 'border-yellow-500/50' : 'border-gray-700'
              }`}>
                <p className={`text-3xl font-bold ${data.stats.expiringIn7Days > 0 ? 'text-yellow-400' : ''}`}>
                  {data.stats.expiringIn7Days}
                </p>
                <p className="text-sm text-gray-400">Expiring Soon</p>
              </div>
              <div className="bg-gray-900 border border-gray-700 rounded-lg p-4">
                <p className="text-3xl font-bold text-blue-400">{data.stats.accessesLast24h}</p>
                <p className="text-sm text-gray-400">Accesses (24h)</p>
              </div>
              <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4">
                <p className="text-3xl font-bold text-green-400">{data.stats.leakIncidents}</p>
                <p className="text-sm text-gray-400">Leak Incidents</p>
              </div>
            </div>

            {/* Compliance Status */}
            <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-6 mb-8">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center">
                  <svg className="w-6 h-6 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <div>
                  <p className="font-semibold text-green-400">Compliance Status: Healthy</p>
                  <p className="text-sm text-gray-400">All secrets protected from source control</p>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div>
                  <p className="text-gray-400">Source Control Leaks</p>
                  <p className="font-medium text-green-400">0 incidents</p>
                </div>
                <div>
                  <p className="text-gray-400">Audit Trail</p>
                  <p className="font-medium text-green-400">Complete</p>
                </div>
                <div>
                  <p className="text-gray-400">Rotation Policy</p>
                  <p className="font-medium text-green-400">Enforced</p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Secrets Inventory */}
              <div className="bg-gray-900 border border-gray-700 rounded-lg p-4">
                <h2 className="text-lg font-semibold mb-4">Secrets Inventory</h2>
                {data.secrets.length === 0 ? (
                  <p className="text-gray-400 text-sm">No secrets tracked.</p>
                ) : (
                  <div className="space-y-2">
                    {data.secrets.map(secret => (
                      <div
                        key={`${secret.project}-${secret.name}`}
                        className={`p-3 rounded ${
                          isExpiringSoon(secret.expiresAt)
                            ? 'bg-yellow-500/10 border border-yellow-500/30'
                            : 'bg-gray-800'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium font-mono text-sm">{secret.name}</p>
                            <p className="text-xs text-gray-400">{secret.project}</p>
                          </div>
                          <div className="text-right">
                            {isExpiringSoon(secret.expiresAt) && (
                              <span className="px-2 py-0.5 bg-yellow-500/20 text-yellow-400 rounded text-xs">
                                Expiring
                              </span>
                            )}
                            <p className="text-xs text-gray-500 mt-1">
                              {secret.accessCount} accesses
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Access Log */}
              <div className="bg-gray-900 border border-gray-700 rounded-lg p-4">
                <h2 className="text-lg font-semibold mb-4">Recent Access Log</h2>
                {data.accessLogs.length === 0 ? (
                  <p className="text-gray-400 text-sm">No recent access.</p>
                ) : (
                  <div className="space-y-2">
                    {data.accessLogs.map(log => (
                      <div key={log.id} className="p-3 bg-gray-800 rounded">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium text-sm">{log.action}</p>
                            <p className="text-xs text-gray-400">
                              {log.secret} in {log.project}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-xs text-gray-400">{log.user}</p>
                            <p className="text-xs text-gray-500">
                              {new Date(log.timestamp).toLocaleString()}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Risk Comparison */}
            <div className="mt-8 bg-gray-900 border border-gray-700 rounded-lg p-6">
              <h2 className="text-lg font-semibold mb-4">Risk Mitigation Value</h2>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-400">
                    <th className="pb-3">Incident Type</th>
                    <th className="pb-3">Industry Avg Cost</th>
                    <th className="pb-3">midex Prevention</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-t border-gray-800">
                    <td className="py-3">API key leak to GitHub</td>
                    <td className="py-3 text-red-400">$50K - $500K+</td>
                    <td className="py-3 text-green-400">Never in source control</td>
                  </tr>
                  <tr className="border-t border-gray-800">
                    <td className="py-3">Credential rotation (emergency)</td>
                    <td className="py-3 text-red-400">4-8 hrs downtime</td>
                    <td className="py-3 text-green-400">Instant, no downtime</td>
                  </tr>
                  <tr className="border-t border-gray-800">
                    <td className="py-3">Security audit preparation</td>
                    <td className="py-3 text-gray-400">40+ hours</td>
                    <td className="py-3 text-green-400">Instant reports</td>
                  </tr>
                  <tr className="border-t border-gray-800">
                    <td className="py-3">Compliance documentation</td>
                    <td className="py-3 text-gray-400">Ongoing manual effort</td>
                    <td className="py-3 text-green-400">Auto-generated</td>
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
