import { NextRequest, NextResponse } from 'next/server';
import { getWorkflowStats } from '@/lib/db';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  const { name } = await params;
  const stats = getWorkflowStats(decodeURIComponent(name));
  return NextResponse.json(stats);
}
