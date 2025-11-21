'use client';

import { useEffect, useState, useCallback } from 'react';
import { StatCard } from '@/components/StatCard';
import { EventList } from '@/components/EventList';
import type { Stats, TelemetryEventRow } from '@/lib/types';

export default function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [events, setEvents] = useState<TelemetryEventRow[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const [statsRes, eventsRes] = await Promise.all([
        fetch('/api/stats'),
        fetch('/api/telemetry?limit=10'),
      ]);

      // Validate responses and handle errors
      if (statsRes.ok) {
        const statsData = await statsRes.json();
        if (!statsData.error) {
          setStats(statsData);
        }
      }

      if (eventsRes.ok) {
        const eventsData = await eventsRes.json();
        // Ensure it's an array before setting
        if (Array.isArray(eventsData)) {
          setEvents(eventsData);
        }
      }
    } catch (err) {
      console.error('Failed to fetch:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, [fetchData]);

  if (loading) {
    return <div className="text-zinc-500">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Dashboard</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Active Workflows"
          value={stats?.activeWorkflows ?? 0}
          variant={stats?.activeWorkflows ? 'default' : 'default'}
        />
        <StatCard
          title="Completed (24h)"
          value={stats?.completedLast24h ?? 0}
          variant="success"
        />
        <StatCard
          title="Failed"
          value={stats?.failedWorkflows ?? 0}
          variant={stats?.failedWorkflows ? 'error' : 'default'}
        />
        <StatCard
          title="Events (1h)"
          value={stats?.eventsLastHour ?? 0}
          subtitle="telemetry events"
        />
      </div>

      <div>
        <h2 className="text-lg font-semibold mb-3">Recent Events</h2>
        <EventList events={events} />
      </div>
    </div>
  );
}
