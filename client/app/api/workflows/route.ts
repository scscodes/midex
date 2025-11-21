import { NextResponse } from 'next/server';
import { getWorkflows } from '@/lib/db';

export async function GET() {
  try {
    const workflows = getWorkflows();

    // Parse JSON fields
    const parsed = workflows.map((w) => ({
      ...w,
      tags: w.tags ? JSON.parse(w.tags) : [],
      phases: w.phases ? JSON.parse(w.phases) : [],
    }));

    return NextResponse.json(parsed);
  } catch (error) {
    console.error('Failed to fetch workflows:', error);
    return NextResponse.json(
      { error: 'Failed to fetch workflows' },
      { status: 500 }
    );
  }
}
