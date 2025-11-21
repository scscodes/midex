import { NextRequest, NextResponse } from 'next/server';
import { getExecutions } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    const executions = getExecutions({
      state: searchParams.get('state') || undefined,
      limit: parseInt(searchParams.get('limit') || '50', 10),
    });

    return NextResponse.json(executions);
  } catch (error) {
    console.error('Failed to fetch executions:', error);
    return NextResponse.json(
      { error: 'Failed to fetch executions' },
      { status: 500 }
    );
  }
}
