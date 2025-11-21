import { NextRequest, NextResponse } from 'next/server';
import { getExecution, getExecutionSteps, getTelemetryEvents } from '@/lib/db';

// Cache for 20 seconds - specific execution details
export const revalidate = 20;

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    const execution = getExecution(id);
    if (!execution) {
      return NextResponse.json({ error: 'Execution not found' }, { status: 404 });
    }

    const steps = getExecutionSteps(id);
    const events = getTelemetryEvents({ executionId: id, limit: 100 });

    return NextResponse.json({ execution, steps, events });
  } catch (error) {
    console.error('Failed to fetch execution details:', error);
    return NextResponse.json(
      { error: 'Failed to fetch execution details' },
      { status: 500 }
    );
  }
}
