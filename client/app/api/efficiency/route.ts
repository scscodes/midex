import { NextResponse } from 'next/server';
import { getWorkflows, getWorkflowStats } from '@/lib/db';
import type { WorkflowRow } from '@/lib/types';

// Cache for 30 seconds - computed efficiency metrics
export const revalidate = 30;

export async function GET() {
  try {
    const workflows = getWorkflows();

    const efficiency = workflows.map(w => {
      const stats = getWorkflowStats(w.name);
      const manualHours = (stats.manualEquivalent / 60) * stats.completed;
      const actualHours = (stats.avgDuration / 3600) * stats.completed;
      const savedHours = Math.max(0, manualHours - actualHours);

      return {
        name: w.name,
        description: w.description,
        total: stats.total,
        completed: stats.completed,
        avgDuration: stats.avgDuration,
        manualEquivalent: stats.manualEquivalent,
        savedHours,
        savedDollars: savedHours * 150,
      };
    });

    return NextResponse.json(efficiency);
  } catch (error) {
    console.error('Failed to fetch efficiency data:', error);
    return NextResponse.json(
      { error: 'Failed to fetch efficiency data' },
      { status: 500 }
    );
  }
}
