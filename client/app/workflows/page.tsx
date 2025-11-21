'use client';

import { useState, useEffect } from 'react';
import { Nav } from '@/components/Nav';
import { parsePhases, parseTags, getComplexityColor } from '@/lib/utils';
import type { WorkflowRow, ParsedPhase } from '@/lib/types';

export default function WorkflowsPage() {
  const [workflows, setWorkflows] = useState<WorkflowRow[]>([]);
  const [selectedWorkflow, setSelectedWorkflow] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/workflows')
      .then(async res => {
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data)) {
            setWorkflows(data);
          }
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const selected = workflows.find(w => w.name === selectedWorkflow);

  return (
    <main className="min-h-screen bg-[#0a0a0a] text-white">
      <Nav />
      <div className="max-w-7xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold mb-6">Workflow Catalog</h1>

        {loading ? (
          <p className="text-gray-400">Loading workflows...</p>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-4">
              {workflows.length === 0 ? (
                <p className="text-gray-400">No workflows defined yet.</p>
              ) : (
                workflows.map(workflow => {
                  const phases = parsePhases(workflow.phases);
                  const tags = parseTags(workflow.tags);
                  return (
                    <div
                      key={workflow.name}
                      onClick={() => setSelectedWorkflow(workflow.name)}
                      className={`p-4 rounded-lg border cursor-pointer transition-colors ${
                        selectedWorkflow === workflow.name
                          ? 'border-blue-500 bg-blue-500/10'
                          : 'border-gray-700 bg-gray-900 hover:border-gray-600'
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <h3 className="font-semibold text-lg">{workflow.name}</h3>
                          <p className="text-gray-400 text-sm mt-1">{workflow.description}</p>
                        </div>
                        <span className={`px-2 py-1 rounded text-xs font-medium ${getComplexityColor(workflow.complexity)}`}>
                          {workflow.complexity || 'unknown'}
                        </span>
                      </div>
                      <div className="mt-3 flex items-center gap-4 text-sm text-gray-500">
                        <span>{phases.length} phases</span>
                        {tags.length > 0 && (
                          <div className="flex gap-1">
                            {tags.slice(0, 3).map(tag => (
                              <span key={tag} className="px-2 py-0.5 bg-gray-800 rounded text-xs">
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="lg:col-span-1">
              {selected ? (
                <div className="bg-gray-900 border border-gray-700 rounded-lg p-4 sticky top-4">
                  <h2 className="text-lg font-semibold mb-4">{selected.name}</h2>
                  <p className="text-gray-400 text-sm mb-4">{selected.description}</p>

                  <h3 className="text-sm font-medium text-gray-300 mb-2">Phases</h3>
                  <div className="space-y-3">
                    {parsePhases(selected.phases).map((phase, idx) => (
                      <div key={idx} className="bg-gray-800 rounded p-3">
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-medium text-sm">{phase.name}</span>
                          <span className="text-xs text-blue-400">{phase.agent}</span>
                        </div>
                        <ul className="text-xs text-gray-400 space-y-1">
                          {phase.steps?.map((step, stepIdx) => (
                            <li key={stepIdx} className="flex items-center gap-2">
                              <span className="w-4 h-4 flex items-center justify-center bg-gray-700 rounded text-[10px]">
                                {stepIdx + 1}
                              </span>
                              {step}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="bg-gray-900 border border-gray-700 rounded-lg p-4 text-center text-gray-400">
                  Select a workflow to view details
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
