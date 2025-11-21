import { NextResponse } from 'next/server';
import { getWorkflows } from '@/lib/db';

export async function GET() {
  const workflows = getWorkflows();

  // Parse JSON fields
  const parsed = workflows.map((w: any) => ({
    ...w,
    tags: w.tags ? JSON.parse(w.tags) : [],
    phases: w.phases ? JSON.parse(w.phases) : [],
  }));

  return NextResponse.json(parsed);
}
