import { NextRequest, NextResponse } from 'next/server';
import { getTelemetryEvents } from '@/lib/db';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  const events = getTelemetryEvents({
    executionId: searchParams.get('execution_id') || undefined,
    eventType: searchParams.get('event_type') || undefined,
    limit: parseInt(searchParams.get('limit') || '100', 10),
    since: searchParams.get('since') || undefined,
  });

  return NextResponse.json(events);
}
