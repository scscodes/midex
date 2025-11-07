import type { Agent } from '../../agents/schema.js';
import type { Rule } from '../../rules/schema.js';
import type { Workflow } from '../../workflows/schema.js';

/**
 * Content backend interface - abstraction for storage backends
 *
 * Defines the contract that all storage backends must implement.
 * This enables swapping between filesystem and database backends.
 */
export interface ContentBackend {
  // Agents
  getAgent(name: string): Promise<Agent>;
  listAgents(): Promise<Agent[]>;
  listAgentsWithTimestamps(): Promise<Array<{ item: Agent; updatedAt: number }>>;
  updateAgent(agent: Agent, updatedAt?: number): Promise<Agent>;

  // Rules
  getRule(name: string): Promise<Rule>;
  listRules(): Promise<Rule[]>;
  listRulesWithTimestamps(): Promise<Array<{ item: Rule; updatedAt: number }>>;
  updateRule(rule: Rule, updatedAt?: number): Promise<Rule>;

  // Workflows
  getWorkflow(name: string): Promise<Workflow>;
  listWorkflows(): Promise<Workflow[]>;
  listWorkflowsWithTimestamps(): Promise<Array<{ item: Workflow; updatedAt: number }>>;
  updateWorkflow(workflow: Workflow, updatedAt?: number): Promise<Workflow>;

  // Lifecycle
  close(): void;
}
