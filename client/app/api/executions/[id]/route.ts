import { NextRequest, NextResponse } from 'next/server';
import { getExecution, getExecutionSteps, getTelemetryEvents } from '@/lib/db';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const execution = getExecution(id);
  if (!execution) {
    return NextResponse.json({ error: 'Execution not found' }, { status: 404 });
  }

  const steps = getExecutionSteps(id);
  const events = getTelemetryEvents({ executionId: id, limit: 100 });

  return NextResponse.json({ execution, steps, events });
}
