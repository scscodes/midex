'use client';

import { useState, useEffect } from 'react';
import { parsePhases, parseTags, getComplexityColor, getComplexityLabel } from '@/lib/utils';
import type { WorkflowRow, AgentRow, ParsedPhase } from '@/lib/types';

type Tab = 'workflows' | 'agents';

export default function LibraryPage() {
  const [activeTab, setActiveTab] = useState<Tab>('workflows');
  const [workflows, setWorkflows] = useState<WorkflowRow[]>([]);
  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [selectedWorkflow, setSelectedWorkflow] = useState<string | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch('/api/workflows').then(r => r.ok ? r.json() : []),
      fetch('/api/agents').then(r => r.ok ? r.json() : []),
    ])
      .then(([workflowsData, agentsData]) => {
        if (Array.isArray(workflowsData)) setWorkflows(workflowsData);
        if (Array.isArray(agentsData)) setAgents(agentsData);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const selectedWorkflowData = workflows.find(w => w.name === selectedWorkflow);
  const selectedAgentData = agents.find(a => a.name === selectedAgent);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Library</h1>
        <div className="flex gap-2 bg-gray-900 border border-gray-700 rounded-lg p-1">
          <button
            onClick={() => setActiveTab('workflows')}
            className={`px-4 py-2 rounded text-sm font-medium transition-colors ${
              activeTab === 'workflows'
                ? 'bg-blue-500 text-white'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            Workflows ({workflows.length})
          </button>
          <button
            onClick={() => setActiveTab('agents')}
            className={`px-4 py-2 rounded text-sm font-medium transition-colors ${
              activeTab === 'agents'
                ? 'bg-blue-500 text-white'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            Agents ({agents.length})
          </button>
        </div>
      </div>

      {loading ? (
        <p className="text-gray-400">Loading library...</p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            {activeTab === 'workflows' ? (
              workflows.length === 0 ? (
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
                          {getComplexityLabel(workflow.complexity)}
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
              )
            ) : (
              agents.length === 0 ? (
                <p className="text-gray-400">No agents defined yet.</p>
              ) : (
                agents.map(agent => {
                  const tags = parseTags(agent.tags);
                  return (
                    <div
                      key={agent.name}
                      onClick={() => setSelectedAgent(agent.name)}
                      className={`p-4 rounded-lg border cursor-pointer transition-colors ${
                        selectedAgent === agent.name
                          ? 'border-blue-500 bg-blue-500/10'
                          : 'border-gray-700 bg-gray-900 hover:border-gray-600'
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <h3 className="font-semibold text-lg">{agent.name}</h3>
                          <p className="text-gray-400 text-sm mt-1">{agent.description}</p>
                        </div>
                        {agent.version && (
                          <span className="px-2 py-1 rounded text-xs font-medium bg-gray-700 text-gray-300">
                            v{agent.version}
                          </span>
                        )}
                      </div>
                      {tags.length > 0 && (
                        <div className="mt-3 flex gap-1">
                          {tags.map(tag => (
                            <span key={tag} className="px-2 py-0.5 bg-gray-800 rounded text-xs text-gray-400">
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })
              )
            )}
          </div>

          <div className="lg:col-span-1">
            {activeTab === 'workflows' ? (
              selectedWorkflowData ? (
                <div className="bg-gray-900 border border-gray-700 rounded-lg p-4 sticky top-4">
                  <h2 className="text-lg font-semibold mb-4">{selectedWorkflowData.name}</h2>
                  <p className="text-gray-400 text-sm mb-4">{selectedWorkflowData.description}</p>

                  <h3 className="text-sm font-medium text-gray-300 mb-2">Phases</h3>
                  <div className="space-y-3">
                    {parsePhases(selectedWorkflowData.phases).map((phase, idx) => (
                      <div key={idx} className="bg-gray-800 rounded p-3">
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-medium text-sm">{phase.phase}</span>
                          <span className="text-xs text-blue-400">{phase.agent}</span>
                        </div>
                        <p className="text-xs text-gray-400 mt-2">{phase.description}</p>
                        {phase.dependsOn && phase.dependsOn.length > 0 && (
                          <div className="mt-2 text-xs text-gray-500">
                            Depends on: {phase.dependsOn.join(', ')}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="bg-gray-900 border border-gray-700 rounded-lg p-4 text-center text-gray-400 sticky top-4">
                  Select a workflow to view details
                </div>
              )
            ) : (
              selectedAgentData ? (
                <div className="bg-gray-900 border border-gray-700 rounded-lg p-4 sticky top-4">
                  <div className="flex items-start justify-between mb-4">
                    <h2 className="text-lg font-semibold">{selectedAgentData.name}</h2>
                    {selectedAgentData.version && (
                      <span className="px-2 py-1 rounded text-xs font-medium bg-gray-700 text-gray-300">
                        v{selectedAgentData.version}
                      </span>
                    )}
                  </div>
                  <p className="text-gray-400 text-sm mb-4">{selectedAgentData.description}</p>

                  {parseTags(selectedAgentData.tags).length > 0 && (
                    <div className="mb-4">
                      <h3 className="text-sm font-medium text-gray-300 mb-2">Tags</h3>
                      <div className="flex flex-wrap gap-1">
                        {parseTags(selectedAgentData.tags).map(tag => (
                          <span key={tag} className="px-2 py-1 bg-gray-800 rounded text-xs">
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="mt-4 pt-4 border-t border-gray-700">
                    <p className="text-xs text-gray-500">
                      Agent personas define specialized capabilities and context for workflow execution.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="bg-gray-900 border border-gray-700 rounded-lg p-4 text-center text-gray-400 sticky top-4">
                  Select an agent to view details
                </div>
              )
            )}
          </div>
        </div>
      )}
    </div>
  );
}
