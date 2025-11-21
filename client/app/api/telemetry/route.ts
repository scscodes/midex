import { NextRequest, NextResponse } from 'next/server';
import { getTelemetryEvents } from '@/lib/db';

// No caching - real-time event stream
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    const events = getTelemetryEvents({
      executionId: searchParams.get('execution_id') || undefined,
      eventType: searchParams.get('event_type') || undefined,
      limit: parseInt(searchParams.get('limit') || '100', 10),
      since: searchParams.get('since') || undefined,
    });

    return NextResponse.json(events);
  } catch (error) {
    console.error('Failed to fetch telemetry events:', error);
    return NextResponse.json(
      { error: 'Failed to fetch telemetry events' },
      { status: 500 }
    );
  }
}
