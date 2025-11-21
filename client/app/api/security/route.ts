import { NextResponse } from 'next/server';
import { getAggregateStats } from '@/lib/db';
import type { SecurityData, SecretInfo, AccessLog } from '@/lib/types';

const SEVEN_DAYS_MS = 7 * 86400000;

function generateMockSecrets(count: number): SecretInfo[] {
  const now = Date.now();
  const templates: SecretInfo[] = [
    { name: 'OPENAI_API_KEY', project: 'backend-api', lastAccess: new Date(now).toISOString(), expiresAt: null, accessCount: 45 },
    { name: 'DATABASE_URL', project: 'backend-api', lastAccess: new Date(now - 3600000).toISOString(), expiresAt: null, accessCount: 120 },
    { name: 'AWS_SECRET_KEY', project: 'infrastructure', lastAccess: new Date(now - 7200000).toISOString(), expiresAt: new Date(now + 5 * 86400000).toISOString(), accessCount: 23 },
    { name: 'STRIPE_SECRET', project: 'frontend-app', lastAccess: new Date(now - 86400000).toISOString(), expiresAt: null, accessCount: 67 },
  ];
  return templates.slice(0, Math.min(count, templates.length));
}

function generateMockAccessLogs(count: number): AccessLog[] {
  const now = Date.now();
  const templates: AccessLog[] = [
    { id: '1', secret: 'OPENAI_API_KEY', project: 'backend-api', action: 'Read', timestamp: new Date(now).toISOString(), user: 'workflow-runner' },
    { id: '2', secret: 'DATABASE_URL', project: 'backend-api', action: 'Read', timestamp: new Date(now - 1800000).toISOString(), user: 'workflow-runner' },
    { id: '3', secret: 'AWS_SECRET_KEY', project: 'infrastructure', action: 'Read', timestamp: new Date(now - 3600000).toISOString(), user: 'deploy-agent' },
    { id: '4', secret: 'STRIPE_SECRET', project: 'frontend-app', action: 'Rotated', timestamp: new Date(now - 86400000).toISOString(), user: 'admin' },
  ];
  return templates.slice(0, Math.min(count, templates.length));
}

function countExpiringSoon(secrets: SecretInfo[]): number {
  return secrets.filter(s => {
    if (!s.expiresAt) return false;
    const diff = new Date(s.expiresAt).getTime() - Date.now();
    return diff > 0 && diff < SEVEN_DAYS_MS;
  }).length;
}

export async function GET() {
  try {
    const stats = getAggregateStats();
    const projectCount = Math.max(2, Math.floor(stats.executions / 10));

    const secrets = generateMockSecrets(projectCount * 2);
    const accessLogs = generateMockAccessLogs(Math.min(stats.executions, 10));

    const data: SecurityData = {
      secrets,
      accessLogs,
      stats: {
        totalSecrets: secrets.length,
        expiringIn7Days: countExpiringSoon(secrets),
        accessesLast24h: accessLogs.length,
        leakIncidents: 0,
      },
    };

    return NextResponse.json(data);
  } catch (error) {
    console.error('Failed to fetch security data:', error);
    return NextResponse.json(
      { error: 'Failed to fetch security data' },
      { status: 500 }
    );
  }
}
