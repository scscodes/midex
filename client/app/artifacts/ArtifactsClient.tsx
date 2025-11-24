'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { MarkdownViewer } from '@/components/MarkdownViewer';
import type { WorkflowArtifactRow } from '@/lib/types';

type ArtifactWithContext = WorkflowArtifactRow & { workflow_name: string };

export default function ArtifactsClient() {
  const searchParams = useSearchParams();
  const initialIdParam = searchParams.get('id');

  const [artifacts, setArtifacts] = useState<ArtifactWithContext[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'preview' | 'raw'>('preview');

  const initialId = useMemo(
    () => (initialIdParam ? Number.parseInt(initialIdParam, 10) : null),
    [initialIdParam]
  );

  useEffect(() => {
    fetch('/api/artifacts')
      .then(async (res) => {
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data)) {
            setArtifacts(data);

            if (data.length > 0) {
              if (initialId && data.some((artifact) => artifact.id === initialId)) {
                setSelectedId(initialId);
              } else {
                setSelectedId(data[0].id);
              }
            }
          }
        }
      })
      .catch((err) => {
        console.error('Failed to load artifacts:', err);
      })
      .finally(() => setLoading(false));
  }, [initialId]);

  const selectedArtifact = artifacts.find((artifact) => artifact.id === selectedId) ?? null;

  const handleDownload = (artifact: ArtifactWithContext) => {
    const blob = new Blob([artifact.content], { type: artifact.content_type || 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = artifact.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const formatDate = (dateStr: string) => new Date(dateStr).toLocaleString();

  return (
    <div className="space-y-6 h-[calc(100vh-8rem)] flex flex-col">
      <div className="flex items-center justify-between flex-shrink-0">
        <h1 className="text-2xl font-bold">Artifacts</h1>
      </div>

      {loading ? (
        <p className="text-gray-400">Loading artifacts...</p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1 min-h-0">
          <div className="lg:col-span-1 bg-zinc-900 border border-zinc-800 rounded-lg overflow-y-auto">
            {artifacts.length === 0 ? (
              <p className="text-gray-400 p-4">No artifacts found.</p>
            ) : (
              <div className="divide-y divide-zinc-800">
                {artifacts.map((artifact) => (
                  <div
                    key={artifact.id}
                    onClick={() => setSelectedId(artifact.id)}
                    className={`p-4 cursor-pointer transition-colors hover:bg-zinc-800 ${
                      selectedId === artifact.id ? 'bg-zinc-800 border-l-4 border-blue-500' : 'border-l-4 border-transparent'
                    }`}
                  >
                    <div className="flex items-start justify-between mb-1">
                      <h3 className="font-medium text-sm truncate pr-2" title={artifact.name}>
                        {artifact.name}
                      </h3>
                      <span className="badge badge-idle text-[10px] px-1.5 py-0.5">{artifact.artifact_type}</span>
                    </div>
                    <div className="flex flex-col gap-1 text-xs text-zinc-500">
                      <div className="flex justify-between">
                        <span>{artifact.step_name}</span>
                        <span>{formatDate(artifact.created_at)}</span>
                      </div>
                      <div className="text-zinc-600 truncate">{artifact.workflow_name}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="lg:col-span-2 bg-zinc-900 border border-zinc-800 rounded-lg flex flex-col overflow-hidden">
            {selectedArtifact ? (
              <>
                <div className="p-4 border-b border-zinc-800 bg-zinc-950 flex items-center justify-between flex-shrink-0">
                  <div>
                    <h2 className="font-bold text-lg">{selectedArtifact.name}</h2>
                    <div className="flex gap-3 text-xs text-zinc-400 mt-1">
                      <span>{selectedArtifact.content_type}</span>
                      <span>{(selectedArtifact.size_bytes / 1024).toFixed(2)} KB</span>
                      <Link href={`/executions/${selectedArtifact.execution_id}`} className="hover:text-blue-400 hover:underline">
                        View Execution
                      </Link>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex bg-zinc-800 rounded p-0.5">
                      <button
                        onClick={() => setViewMode('preview')}
                        className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${
                          viewMode === 'preview' ? 'bg-zinc-700 text-white shadow' : 'text-zinc-400 hover:text-zinc-300'
                        }`}
                      >
                        Preview
                      </button>
                      <button
                        onClick={() => setViewMode('raw')}
                        className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${
                          viewMode === 'raw' ? 'bg-zinc-700 text-white shadow' : 'text-zinc-400 hover:text-zinc-300'
                        }`}
                      >
                        Raw
                      </button>
                    </div>
                    <button
                      onClick={() => handleDownload(selectedArtifact)}
                      className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium rounded transition-colors"
                    >
                      Download
                    </button>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto p-6 bg-zinc-900">
                  {viewMode === 'preview' ? (
                    <MarkdownViewer content={selectedArtifact.content} />
                  ) : (
                    <pre className="text-sm font-mono text-zinc-300 whitespace-pre-wrap break-all">{selectedArtifact.content}</pre>
                  )}
                </div>
              </>
            ) : (
              <div className="flex items-center justify-center h-full text-zinc-500">Select an artifact to view details</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

