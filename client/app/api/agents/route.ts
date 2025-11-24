import { NextResponse } from 'next/server';
import { getAgents } from '@/lib/db';
import { validateArray, AgentRowSchema } from '@/lib/schemas';
import { z } from 'zod';

export const revalidate = 60; // Cache for 1 minute

// Schema for parsed agent with validated tags
const ParsedAgentSchema = AgentRowSchema.extend({
  tags: z.array(z.string()),
});

export async function GET() {
  try {
    const agents = getAgents();

    // Parse JSON tags field
    const parsed = agents.map((a) => ({
      ...a,
      tags: a.tags ? JSON.parse(a.tags) : [],
    }));

    // Validate data structure
    const validated = validateArray(ParsedAgentSchema, parsed, 'agents');

    return NextResponse.json(validated);
  } catch (error) {
    console.error('Failed to fetch agents:', error);

    if (error instanceof Error && error.name === 'ZodError') {
      return NextResponse.json(
        { error: 'Invalid agent data format' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to fetch agents' },
      { status: 500 }
    );
  }
}
