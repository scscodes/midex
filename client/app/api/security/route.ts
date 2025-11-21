import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET() {
  const db = getDb();

  // Get basic stats to derive mock security data
  const executions = db.prepare('SELECT COUNT(*) as count FROM workflow_executions_v2').get() as { count: number };

  // Simulated secrets data (would come from secrets_registry table)
  const projectCount = Math.max(2, Math.floor(executions.count / 10));

  const secrets = [
    { name: 'OPENAI_API_KEY', project: 'backend-api', lastAccess: new Date().toISOString(), expiresAt: null, accessCount: 45 },
    { name: 'DATABASE_URL', project: 'backend-api', lastAccess: new Date(Date.now() - 3600000).toISOString(), expiresAt: null, accessCount: 120 },
    { name: 'AWS_SECRET_KEY', project: 'infrastructure', lastAccess: new Date(Date.now() - 7200000).toISOString(), expiresAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(), accessCount: 23 },
    { name: 'STRIPE_SECRET', project: 'frontend-app', lastAccess: new Date(Date.now() - 86400000).toISOString(), expiresAt: null, accessCount: 67 },
  ].slice(0, projectCount * 2);

  const accessLogs = [
    { id: '1', secret: 'OPENAI_API_KEY', project: 'backend-api', action: 'Read', timestamp: new Date().toISOString(), user: 'workflow-runner' },
    { id: '2', secret: 'DATABASE_URL', project: 'backend-api', action: 'Read', timestamp: new Date(Date.now() - 1800000).toISOString(), user: 'workflow-runner' },
    { id: '3', secret: 'AWS_SECRET_KEY', project: 'infrastructure', action: 'Read', timestamp: new Date(Date.now() - 3600000).toISOString(), user: 'deploy-agent' },
    { id: '4', secret: 'STRIPE_SECRET', project: 'frontend-app', action: 'Rotated', timestamp: new Date(Date.now() - 86400000).toISOString(), user: 'admin' },
  ].slice(0, Math.min(executions.count, 10));

  const expiringSecrets = secrets.filter(s => {
    if (!s.expiresAt) return false;
    const diff = new Date(s.expiresAt).getTime() - Date.now();
    return diff > 0 && diff < 7 * 24 * 60 * 60 * 1000;
  });

  return NextResponse.json({
    secrets,
    accessLogs,
    stats: {
      totalSecrets: secrets.length,
      expiringIn7Days: expiringSecrets.length,
      accessesLast24h: accessLogs.length,
      leakIncidents: 0, // Always 0 - that's the point!
    },
  });
}
