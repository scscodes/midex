'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { EventList } from '@/components/EventList';
import type { ExecutionRow, ExecutionStepRow, TelemetryEventRow, WorkflowArtifactRow } from '@/lib/types';
import { formatDurationMs, safeParseJSON } from '@/lib/utils';

interface ExecutionDetail {
  execution: ExecutionRow;
  steps: ExecutionStepRow[];
  artifacts: WorkflowArtifactRow[];
  events: TelemetryEventRow[];
}

export default function ExecutionDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const [data, setData] = useState<ExecutionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedStep, setExpandedStep] = useState<number | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch(`/api/executions/${id}`);
        if (res.ok) {
          const responseData = await res.json();
          // Validate structure before setting
          if (responseData && !responseData.error && responseData.execution) {
            setData(responseData);
          }
        }
      } catch (err) {
        console.error('Failed to fetch:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, [id]);

  if (loading) {
    return <div className="text-zinc-500">Loading...</div>;
  }

  if (!data) {
    return <div className="text-red-400">Execution not found</div>;
  }

  const { execution, steps, artifacts = [], events } = data;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/executions" className="text-zinc-400 hover:text-white">
          ← Back
        </Link>
        <h1 className="text-2xl font-bold">{execution.workflow_name}</h1>
        <span className={`badge badge-${execution.state}`}>{execution.state}</span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="stat-card">
          <p className="text-zinc-400 text-sm">Execution ID</p>
          <p className="font-mono text-xs mt-1 break-all">{execution.execution_id}</p>
        </div>
        <div className="stat-card">
          <p className="text-zinc-400 text-sm">Started</p>
          <p className="text-sm mt-1">{new Date(execution.started_at).toLocaleString()}</p>
        </div>
        <div className="stat-card">
          <p className="text-zinc-400 text-sm">Duration</p>
          <p className="text-xl font-bold mt-1">{formatDurationMs(execution.duration_ms)}</p>
        </div>
        <div className="stat-card">
          <p className="text-zinc-400 text-sm">Steps</p>
          <p className="text-xl font-bold mt-1">{steps.length}</p>
        </div>
      </div>

      <div>
        <h2 className="text-lg font-semibold mb-3">Step Timeline</h2>
        <div className="space-y-2">
          {steps.map((step, idx) => (
            <div
              key={step.id}
              className={`bg-zinc-900 border border-zinc-800 rounded p-3 cursor-pointer ${
                execution.current_step === step.step_name ? 'ring-2 ring-blue-500' : ''
              }`}
              onClick={() => setExpandedStep(expandedStep === step.id ? null : step.id)}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-zinc-500 w-6">{idx + 1}.</span>
                  <span className="font-medium">{step.step_name}</span>
                  <span className="text-zinc-500 text-sm">{step.agent_name}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-zinc-400 text-sm">{formatDurationMs(step.duration_ms)}</span>
                  <span className={`badge badge-${step.status}`}>{step.status}</span>
                </div>
              </div>
              {expandedStep === step.id && step.output && (
                <div className="mt-3 pt-3 border-t border-zinc-800">
                  <p className="text-zinc-400 text-sm mb-2">Output:</p>
                  <pre className="text-xs bg-zinc-950 p-2 rounded overflow-x-auto text-zinc-400">
                    {JSON.stringify(safeParseJSON(step.output, null), null, 2)}
                  </pre>
                </div>
              )}
            </div>
          ))}
          {steps.length === 0 && (
            <p className="text-zinc-500 text-center py-4">No steps recorded</p>
          )}
        </div>
      </div>

      <div>
        <h2 className="text-lg font-semibold mb-3">Artifacts</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {artifacts.map((artifact) => (
            <Link
              key={artifact.id}
              href={`/artifacts?id=${artifact.id}`}
              className="bg-zinc-900 border border-zinc-800 rounded p-3 block hover:border-blue-500 transition-colors group"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm group-hover:text-blue-400 transition-colors">{artifact.name}</span>
                  <span className="badge badge-idle text-xs">{artifact.artifact_type}</span>
                </div>
                <span className="text-zinc-500 text-xs">{artifact.step_name}</span>
              </div>
              <div className="text-xs text-zinc-400 bg-zinc-950 rounded p-2 overflow-x-auto max-h-32 pointer-events-none">
                <pre>{artifact.content.slice(0, 300)}{artifact.content.length > 300 ? '...' : ''}</pre>
              </div>
            </Link>
          ))}
          {artifacts.length === 0 && (
            <p className="text-zinc-500 text-center py-4 col-span-full">No artifacts produced</p>
          )}
        </div>
      </div>

      <div>
        <h2 className="text-lg font-semibold mb-3">Events</h2>
        <EventList events={events} />
      </div>
    </div>
  );
}
