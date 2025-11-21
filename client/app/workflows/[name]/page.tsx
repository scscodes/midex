'use client';

import { useState, useEffect, use } from 'react';
import Link from 'next/link';
import { Nav } from '@/components/Nav';
import type { WorkflowRow, WorkflowStats } from '@/lib/types';
import { parsePhases, formatDuration } from '@/lib/utils';

export default function WorkflowDetailPage({ params }: { params: Promise<{ name: string }> }) {
  const { name } = use(params);
  const [workflow, setWorkflow] = useState<WorkflowRow | null>(null);
  const [stats, setStats] = useState<WorkflowStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch(`/api/workflows/${encodeURIComponent(name)}`).then(r => r.json()),
      fetch(`/api/workflows/${encodeURIComponent(name)}/stats`).then(r => r.json()),
    ])
      .then(([workflowData, statsData]) => {
        setWorkflow(workflowData);
        setStats(statsData);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [name]);

  const calculateSavings = () => {
    if (!stats || stats.total === 0) return null;
    const manualHours = (stats.manualEquivalent / 60) * stats.completed;
    const actualHours = (stats.avgDuration / 3600) * stats.completed;
    const savedHours = manualHours - actualHours;
    const savedDollars = savedHours * 150; // Configurable rate
    return { manualHours, actualHours, savedHours, savedDollars };
  };

  const savings = calculateSavings();

  return (
    <main className="min-h-screen bg-[#0a0a0a] text-white">
      <Nav />
      <div className="max-w-5xl mx-auto px-4 py-8">
        <Link href="/workflows" className="text-blue-400 hover:underline text-sm mb-4 inline-block">
          ← Back to Workflows
        </Link>

        {loading ? (
          <p className="text-gray-400">Loading...</p>
        ) : !workflow ? (
          <p className="text-gray-400">Workflow not found.</p>
        ) : (
          <>
            <div className="mb-8">
              <h1 className="text-2xl font-bold">{workflow.name}</h1>
              <p className="text-gray-400 mt-2">{workflow.description}</p>
            </div>

            {stats && stats.total > 0 && (
              <div className="bg-gray-900 border border-gray-700 rounded-lg p-6 mb-8">
                <h2 className="text-lg font-semibold mb-4">Efficiency Tracking</h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                  <div>
                    <p className="text-2xl font-bold">{stats.total}</p>
                    <p className="text-sm text-gray-400">Total Runs</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-green-400">{stats.completed}</p>
                    <p className="text-sm text-gray-400">Completed</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-red-400">{stats.failed}</p>
                    <p className="text-sm text-gray-400">Failed</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{formatDuration(stats.avgDuration)}</p>
                    <p className="text-sm text-gray-400">Avg Duration</p>
                  </div>
                </div>

                {savings && savings.savedHours > 0 && (
                  <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4">
                    <h3 className="text-green-400 font-semibold mb-2">Time Savings</h3>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <p className="text-gray-400">Manual equivalent</p>
                        <p className="text-lg">{savings.manualHours.toFixed(1)} hours</p>
                      </div>
                      <div>
                        <p className="text-gray-400">Actual time</p>
                        <p className="text-lg">{savings.actualHours.toFixed(1)} hours</p>
                      </div>
                      <div>
                        <p className="text-gray-400">Hours saved</p>
                        <p className="text-lg text-green-400">{savings.savedHours.toFixed(1)} hours</p>
                      </div>
                      <div>
                        <p className="text-gray-400">Value @ $150/hr</p>
                        <p className="text-lg text-green-400">${savings.savedDollars.toLocaleString()}</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="bg-gray-900 border border-gray-700 rounded-lg p-6">
              <h2 className="text-lg font-semibold mb-4">Workflow Phases</h2>
              <div className="space-y-4">
                {parsePhases(workflow.phases).map((phase, idx) => (
                  <div key={idx} className="border-l-2 border-blue-500 pl-4">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center text-xs font-bold">
                        {idx + 1}
                      </span>
                      <span className="font-medium">{phase.name}</span>
                      <span className="text-xs text-gray-400 bg-gray-800 px-2 py-0.5 rounded">
                        {phase.agent}
                      </span>
                    </div>
                    {phase.steps && phase.steps.length > 0 && (
                      <ul className="text-sm text-gray-400 ml-9 space-y-1">
                        {phase.steps.map((step: string, stepIdx: number) => (
                          <li key={stepIdx}>• {step}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
