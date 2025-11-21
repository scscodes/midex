import { NextRequest, NextResponse } from 'next/server';
import { getExecutions } from '@/lib/db';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  const executions = getExecutions({
    state: searchParams.get('state') || undefined,
    limit: parseInt(searchParams.get('limit') || '50', 10),
  });

  return NextResponse.json(executions);
}
