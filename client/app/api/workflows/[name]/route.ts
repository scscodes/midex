import { NextRequest, NextResponse } from 'next/server';
import { getWorkflow } from '@/lib/db';

// Cache for 60 seconds - workflow definitions rarely change
export const revalidate = 60;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  try {
    const { name } = await params;
    const workflow = getWorkflow(decodeURIComponent(name));

    if (!workflow) {
      return NextResponse.json({ error: 'Workflow not found' }, { status: 404 });
    }

    return NextResponse.json(workflow);
  } catch (error) {
    console.error('Failed to fetch workflow:', error);
    return NextResponse.json(
      { error: 'Failed to fetch workflow' },
      { status: 500 }
    );
  }
}
