import { NextRequest, NextResponse } from 'next/server';
import { getAllArtifacts } from '@/lib/db';

// Cache for 10 seconds
export const revalidate = 10;

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '100', 10);

    const artifacts = getAllArtifacts(limit);

    return NextResponse.json(artifacts);
  } catch (error) {
    console.error('Failed to fetch artifacts:', error);
    return NextResponse.json(
      { error: 'Failed to fetch artifacts' },
      { status: 500 }
    );
  }
}

