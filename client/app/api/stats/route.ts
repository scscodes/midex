import { NextResponse } from 'next/server';
import { getStats } from '@/lib/db';

// Cache for 10 seconds - dashboard stats update frequently
export const revalidate = 10;

export async function GET() {
  try {
    const stats = getStats();
    return NextResponse.json(stats);
  } catch (error) {
    console.error('Failed to fetch stats:', error);
    return NextResponse.json(
      { error: 'Failed to fetch statistics' },
      { status: 500 }
    );
  }
}
