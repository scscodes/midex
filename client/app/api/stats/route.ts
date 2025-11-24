import { NextResponse } from 'next/server';
import { getStats } from '@/lib/db';
import { StatsSchema } from '@/lib/schemas';

// Cache for 10 seconds - dashboard stats update frequently
export const revalidate = 10;

export async function GET() {
  try {
    const stats = getStats();

    // Validate data before returning to client
    const validated = StatsSchema.parse(stats);

    return NextResponse.json(validated);
  } catch (error) {
    console.error('Failed to fetch stats:', error);

    // Check if it's a validation error
    if (error instanceof Error && error.name === 'ZodError') {
      return NextResponse.json(
        { error: 'Invalid stats data format' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to fetch statistics' },
      { status: 500 }
    );
  }
}
