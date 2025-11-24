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
    const parsed = workflows.map((w) => {
      let tags: string[] = [];
      if (Array.isArray(w.tags)) {
        tags = w.tags;
      } else if (typeof w.tags === 'string' && w.tags.trim().length > 0) {
        tags = JSON.parse(w.tags);
      }

      let phases: z.infer<typeof ParsedPhaseSchema>[] = [];
      if (Array.isArray(w.phases)) {
        phases = w.phases as z.infer<typeof ParsedPhaseSchema>[];
      } else if (typeof w.phases === 'string' && w.phases.trim().length > 0) {
        phases = JSON.parse(w.phases);
      }

      return {
        ...w,
        tags,
        phases,
      };
    });

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
