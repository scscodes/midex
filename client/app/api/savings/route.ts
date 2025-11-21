import { NextResponse } from 'next/server';
import { getAggregateStats } from '@/lib/db';
import type { SavingsData, DriftEvent, ProjectSync } from '@/lib/types';

function generateMockProjectSync(count: number): ProjectSync[] {
  const now = Date.now();
  const templates: ProjectSync[] = [
    { name: 'frontend-app', lastSync: new Date(now).toISOString(), configCount: 5, status: 'synced' },
    { name: 'backend-api', lastSync: new Date(now - 3600000).toISOString(), configCount: 4, status: 'synced' },
    { name: 'shared-lib', lastSync: new Date(now - 172800000).toISOString(), configCount: 3, status: 'stale' },
  ];
  return templates.slice(0, Math.min(count, templates.length));
}

function generateMockDriftEvents(count: number): DriftEvent[] {
  if (count === 0) return [];
  return [{
    id: '1',
    project: 'frontend-app',
    file: '.eslintrc.json',
    detected_at: new Date(Date.now() - 3600000).toISOString(),
    status: 'resolved',
  }];
}

export async function GET() {
  try {
    const stats = getAggregateStats();

    const filesManaged = stats.workflows * 3;
    const projectsManaged = Math.max(1, Math.floor(stats.workflows / 2));
    const syncEvents = stats.completed * 2;
    const driftPrevented = Math.floor(syncEvents * 0.1);
    const hoursSaved = (stats.completed * 30) / 60;

    const data: SavingsData = {
      filesManaged,
      projectsManaged,
      syncEvents,
      driftPrevented,
      secretsProtected: Math.ceil(projectsManaged * 1.5),
      hoursSaved,
      lastSync: new Date().toISOString(),
      driftEvents: generateMockDriftEvents(driftPrevented),
      projectSyncStatus: generateMockProjectSync(projectsManaged),
    };

    return NextResponse.json(data);
  } catch (error) {
    console.error('Failed to fetch savings data:', error);
    return NextResponse.json(
      { error: 'Failed to fetch savings data' },
      { status: 500 }
    );
  }
}
