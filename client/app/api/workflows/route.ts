import { NextResponse } from 'next/server';
import { getWorkflows } from '@/lib/db';
import { validateArray, WorkflowRowSchema, ParsedPhaseSchema } from '@/lib/schemas';
import { z } from 'zod';

// Cache for 60 seconds - workflow catalog rarely changes
export const revalidate = 60;

// Schema for parsed workflow with validated structure
const ParsedWorkflowSchema = WorkflowRowSchema.extend({
  tags: z.array(z.string()),
  phases: z.array(ParsedPhaseSchema),
});

export async function GET() {
  try {
    const workflows = getWorkflows();

    // Parse JSON fields
    const parsed = workflows.map((w) => ({
      ...w,
      tags: w.tags ? JSON.parse(w.tags) : [],
      phases: w.phases ? JSON.parse(w.phases) : [],
    }));

    // Validate all workflows have correct structure
    const validated = validateArray(ParsedWorkflowSchema, parsed, 'workflows');

    return NextResponse.json(validated);
  } catch (error) {
    console.error('Failed to fetch workflows:', error);

    if (error instanceof Error && error.name === 'ZodError') {
      return NextResponse.json(
        { error: 'Invalid workflow data format' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to fetch workflows' },
      { status: 500 }
    );
  }
}
