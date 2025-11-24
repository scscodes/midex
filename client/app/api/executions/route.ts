import { NextRequest, NextResponse } from 'next/server';
import { getExecutions } from '@/lib/db';
import { validateArray, ExecutionRowSchema, ExecutionStateSchema } from '@/lib/schemas';
import { z } from 'zod';

// Cache for 10 seconds - execution list updates frequently
export const revalidate = 10;

// Query parameter schema
const QueryParamsSchema = z.object({
  state: ExecutionStateSchema.optional(),
  limit: z.number().int().min(1).max(100),
});

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    // Parse and validate query parameters
    const params = QueryParamsSchema.parse({
      state: searchParams.get('state') || undefined,
      limit: parseInt(searchParams.get('limit') || '50', 10),
    });

    const executions = getExecutions(params);

    // Validate response data
    const validated = validateArray(ExecutionRowSchema, executions, 'executions');

    return NextResponse.json(validated);
  } catch (error) {
    console.error('Failed to fetch executions:', error);

    if (error instanceof Error && error.name === 'ZodError') {
      return NextResponse.json(
        { error: 'Invalid request parameters or data format' },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to fetch executions' },
      { status: 500 }
    );
  }
}
