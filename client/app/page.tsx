'use client';

import { useEffect, useState } from 'react';
import { StatCard } from '@/components/StatCard';
import { EventList } from '@/components/EventList';

interface Stats {
  activeWorkflows: number;
  completedLast24h: number;
  failedWorkflows: number;
  eventsLastHour: number;
}

export default function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    try {
      const [statsRes, eventsRes] = await Promise.all([
        fetch('/api/stats'),
        fetch('/api/telemetry?limit=10'),
      ]);
      setStats(await statsRes.json());
      setEvents(await eventsRes.json());
    } catch (err) {
      console.error('Failed to fetch:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, []);

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
