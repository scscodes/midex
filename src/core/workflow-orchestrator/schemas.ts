/**
 * Zod schemas for contract validation
 * Provides runtime validation aligned with content-registry pattern
 */

import { z } from 'zod';
import { TriggersSchema } from '../content-registry/lib/shared-schemas';

// Shared schemas
export const ArtifactSchema = z.object({
  type: z.string().max(100),
  title: z.string().max(200),
  content: z.string(), // No max - can be long
  description: z.string().max(1000).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const DecisionSchema = z.object({
  decision: z.string().max(500),
  rationale: z.string().max(2000),
  alternatives_rejected: z.array(z.string().max(500)).max(10).default([]),
  trade_offs: z.string().max(1000).optional(),
  context: z.string().max(2000).optional(),
});

export const FindingSchema = z.object({
  severity: z.enum(['critical', 'high', 'medium', 'low']),
  category: z.string().max(100).optional(),
  description: z.string().max(1000),
  location: z.string().max(500).optional(),
  recommendation: z.string().max(1000).optional(),
  impact: z.string().max(1000).optional(),
});

// Layer 1: Workflow Contracts
export const WorkflowInputSchema = z.object({
  name: z.string().min(1).max(200),
  reason: z.string().min(1).max(2000),
  triggers: TriggersSchema.optional(),
  expected_output: z.literal('WorkflowOutput'),
});

// Forward reference for StepOutput in WorkflowOutput
const StepOutputSchemaRef = z.lazy(() => StepOutputSchema);

export const WorkflowOutputSchema = z.object({
  summary: z.string().max(5000),
  workflow: z.object({
    name: z.string().max(200),
    reason: z.string().max(2000).optional(),
  }),
  steps: z.array(StepOutputSchemaRef).max(100).default([]),
  artifacts: z.array(ArtifactSchema).max(100).default([]),
  decisions: z.array(DecisionSchema).max(50).default([]),
  findings: z.array(FindingSchema).max(100).default([]),
  next_steps: z.array(z.string().max(500)).max(50).default([]),
  blockers: z.array(z.string().max(500)).max(50).default([]),
  references: z.array(z.string().max(500)).max(100).default([]),
  confidence: z.number().min(0).max(1),
});

// Layer 2: Step Contracts
export const StepInputSchema = z.object({
  step: z.string().min(1).max(200),
  task: z.string().min(1).max(2000),
  constraints: z.array(z.string().max(500)).max(50).default([]),
  references: z.array(z.string().max(500)).max(100).default([]),
  expected_output: z.literal('StepOutput'),
});

export const StepOutputSchema = z.object({
  summary: z.string().max(5000),
  artifacts: z.array(ArtifactSchema).max(100).default([]),
  findings: z.array(FindingSchema).max(100).default([]),
  next_steps: z.array(z.string().max(500)).max(50).default([]),
  blockers: z.array(z.string().max(500)).max(50).default([]),
  references: z.array(z.string().max(500)).max(100).default([]),
  confidence: z.number().min(0).max(1),
});

// Layer 3: Agent Task Contracts
export const AgentInputSchema = z.object({
  task: z.string().min(1).max(2000),
  constraints: z.array(z.string().max(500)).max(50).default([]),
  references: z.array(z.string().max(500)).max(100).default([]),
  expected_output: z.literal('AgentOutput'),
});

export const AgentOutputSchema = z.object({
  summary: z.string().max(5000),
  artifacts: z.array(ArtifactSchema).max(100).default([]),
  decisions: z.array(DecisionSchema).max(50).default([]),
  findings: z.array(FindingSchema).max(100).default([]),
  next_steps: z.array(z.string().max(500)).max(50).default([]),
  blockers: z.array(z.string().max(500)).max(50).default([]),
  references: z.array(z.string().max(500)).max(100).default([]),
  confidence: z.number().min(0).max(1),
});

// Type exports - Single source of truth for contract types
// All contract types are inferred from schemas to prevent drift
export type WorkflowInput = z.infer<typeof WorkflowInputSchema>;
export type WorkflowOutput = z.infer<typeof WorkflowOutputSchema>;
export type StepInput = z.infer<typeof StepInputSchema>;
export type StepOutput = z.infer<typeof StepOutputSchema>;
export type AgentInput = z.infer<typeof AgentInputSchema>;
export type AgentOutput = z.infer<typeof AgentOutputSchema>;
export type Artifact = z.infer<typeof ArtifactSchema>;
export type Decision = z.infer<typeof DecisionSchema>;
export type Finding = z.infer<typeof FindingSchema>;

