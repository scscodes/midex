import { NextRequest, NextResponse } from 'next/server';
import { getWorkflowStats } from '@/lib/db';

// Cache for 20 seconds - workflow execution statistics
export const revalidate = 20;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  try {
    const { name } = await params;
    const stats = getWorkflowStats(decodeURIComponent(name));
    return NextResponse.json(stats);
  } catch (error) {
    console.error('Failed to fetch workflow stats:', error);
    return NextResponse.json(
      { error: 'Failed to fetch workflow statistics' },
      { status: 500 }
    );
  }
}
