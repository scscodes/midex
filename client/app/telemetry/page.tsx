'use client';

import { useEffect, useState, useRef } from 'react';
import { EventList } from '@/components/EventList';

const EVENT_TYPES = [
  'all',
  'workflow_created',
  'workflow_started',
  'workflow_completed',
  'workflow_failed',
  'step_started',
  'step_completed',
  'step_failed',
  'token_generated',
  'token_validated',
  'error',
];

export default function TelemetryPage() {
  const [events, setEvents] = useState<any[]>([]);
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const lastTimestamp = useRef<string | null>(null);

  const fetchEvents = async (since?: string) => {
    try {
      const params = new URLSearchParams({ limit: '100' });
      if (filter !== 'all') params.set('event_type', filter);
      if (since) params.set('since', since);

      const res = await fetch(`/api/telemetry?${params}`);
      const data = await res.json();

      if (since && data.length > 0) {
        setEvents((prev) => [...data, ...prev].slice(0, 200));
      } else if (!since) {
        setEvents(data);
      }

      if (data.length > 0) {
        lastTimestamp.current = data[0].created_at;
      }
    } catch (err) {
      console.error('Failed to fetch:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    lastTimestamp.current = null;
    fetchEvents();
  }, [filter]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (lastTimestamp.current) {
        fetchEvents(lastTimestamp.current);
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [filter]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Live Events</h1>
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="bg-zinc-900 border border-zinc-700 rounded px-3 py-1.5 text-sm"
        >
          {EVENT_TYPES.map((type) => (
            <option key={type} value={type}>
              {type === 'all' ? 'All Events' : type}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="text-zinc-500">Loading...</div>
      ) : (
        <EventList events={events} />
      )}
    </div>
  );
}
