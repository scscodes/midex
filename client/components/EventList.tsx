'use client';

import { useState } from 'react';

interface TelemetryEvent {
  id: number;
  event_type: string;
  execution_id: string | null;
  step_name: string | null;
  agent_name: string | null;
  metadata: string | null;
  created_at: string;
}

interface EventListProps {
  events: TelemetryEvent[];
}

export function EventList({ events }: EventListProps) {
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const formatTime = (iso: string) => {
    const date = new Date(iso);
    return date.toLocaleTimeString();
  };

  const parseMetadata = (meta: string | null) => {
    if (!meta) return null;
    try {
      return JSON.parse(meta);
    } catch {
      return null;
    }
  };

  return (
    <div className="space-y-2">
      {events.map((event) => (
        <div
          key={event.id}
          className={`bg-zinc-900 border border-zinc-800 rounded p-3 border-l-4 event-${event.event_type} cursor-pointer`}
          onClick={() => setExpandedId(expandedId === event.id ? null : event.id)}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="badge badge-idle">{event.event_type}</span>
              {event.execution_id && (
                <span className="text-zinc-500 text-xs font-mono">{event.execution_id.slice(0, 12)}...</span>
              )}
              {event.step_name && (
                <span className="text-zinc-400 text-xs">{event.step_name}</span>
              )}
            </div>
            <span className="text-zinc-500 text-xs">{formatTime(event.created_at)}</span>
          </div>
          {expandedId === event.id && event.metadata && (
            <pre className="mt-2 text-xs bg-zinc-950 p-2 rounded overflow-x-auto text-zinc-400">
              {JSON.stringify(parseMetadata(event.metadata), null, 2)}
            </pre>
          )}
        </div>
      ))}
      {events.length === 0 && (
        <p className="text-zinc-500 text-center py-8">No events</p>
      )}
    </div>
  );
}
