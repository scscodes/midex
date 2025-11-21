import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET() {
  const db = getDb();

  // Get aggregate stats from telemetry and executions
  const workflowStats = db.prepare(`
    SELECT COUNT(DISTINCT workflow_name) as workflows,
           COUNT(*) as executions
    FROM workflow_executions_v2
  `).get() as { workflows: number; executions: number };

  const completedCount = db.prepare(`
    SELECT COUNT(*) as count FROM workflow_executions_v2 WHERE state = 'completed'
  `).get() as { count: number };

  // Simulated savings data (would come from config registry in full implementation)
  // These would be real queries against a config_files/project_configs table
  const filesManaged = workflowStats.workflows * 3; // Estimate 3 configs per workflow
  const projectsManaged = Math.max(1, Math.floor(workflowStats.workflows / 2));
  const syncEvents = completedCount.count * 2; // Each execution syncs configs
  const driftPrevented = Math.floor(syncEvents * 0.1); // ~10% would have drifted

  // Calculate hours saved based on workflow automation
  // Assume each workflow saves ~30 min vs manual process
  const hoursSaved = (completedCount.count * 30) / 60;

  // Mock project sync data (would come from real project tracking)
  const projectSyncStatus = [
    { name: 'frontend-app', lastSync: new Date().toISOString(), configCount: 5, status: 'synced' as const },
    { name: 'backend-api', lastSync: new Date(Date.now() - 3600000).toISOString(), configCount: 4, status: 'synced' as const },
    { name: 'shared-lib', lastSync: new Date(Date.now() - 86400000 * 2).toISOString(), configCount: 3, status: 'stale' as const },
  ].slice(0, projectsManaged);

  // Mock drift events (would come from drift_events table)
  const driftEvents = driftPrevented > 0 ? [
    {
      id: '1',
      project: 'frontend-app',
      file: '.eslintrc.json',
      detected_at: new Date(Date.now() - 3600000).toISOString(),
      status: 'resolved' as const,
    },
  ] : [];

  return NextResponse.json({
    filesManaged,
    projectsManaged,
    syncEvents,
    driftPrevented,
    secretsProtected: Math.ceil(projectsManaged * 1.5), // Estimate secrets per project
    hoursSaved,
    lastSync: new Date().toISOString(),
    driftEvents,
    projectSyncStatus,
  });
}
