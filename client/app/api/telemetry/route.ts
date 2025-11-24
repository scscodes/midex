import { NextRequest, NextResponse } from 'next/server';
import { getTelemetryEvents } from '@/lib/db';
import { validateArray, TelemetryEventRowSchema } from '@/lib/schemas';
import { z } from 'zod';

// No caching - real-time event stream
export const dynamic = 'force-dynamic';

// Query parameter schema
const QueryParamsSchema = z.object({
  execution_id: z.string().optional(),
  event_type: z.string().optional(),
  limit: z.number().int().min(1).max(1000),
  since: z.string().optional(),
});

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    // Parse and validate query parameters
    const params = QueryParamsSchema.parse({
      execution_id: searchParams.get('execution_id') || undefined,
      event_type: searchParams.get('event_type') || undefined,
      limit: parseInt(searchParams.get('limit') || '100', 10),
      since: searchParams.get('since') || undefined,
    });

    const events = getTelemetryEvents(params);

    // Validate response data
    const validated = validateArray(TelemetryEventRowSchema, events, 'telemetry events');

    return NextResponse.json(validated);
  } catch (error) {
    console.error('Failed to fetch telemetry events:', error);

    if (error instanceof Error && error.name === 'ZodError') {
      return NextResponse.json(
        { error: 'Invalid request parameters or data format' },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to fetch telemetry events' },
      { status: 500 }
    );
  }
}
