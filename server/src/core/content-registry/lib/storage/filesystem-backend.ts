import type { ContentBackend } from './interface.js';
import { AgentFactory } from '../../agents/index.js';
import { RuleFactory } from '../../rules/index.js';
import { WorkflowFactory } from '../../workflows/index.js';
import type { Agent } from '../../agents/schema.js';
import type { Rule } from '../../rules/schema.js';
import type { Workflow } from '../../workflows/schema.js';
import { computeFileHash } from '../content/hash.js';
import { pathJoin } from '../path.js';

export class FilesystemBackend implements ContentBackend {
  constructor(private readonly basePath: string) {}

  // Agents
  async getAgent(name: string): Promise<Agent> {
    return AgentFactory.load(this.basePath, name);
  }

  async listAgents(): Promise<Agent[]> {
    return AgentFactory.list(this.basePath);
  }

  async listAgentsWithTimestamps(): Promise<Array<{ item: Agent; updatedAt: number }>> {
    const { statSync } = await import('fs');
    const agents = await AgentFactory.list(this.basePath);

    return agents.map(agent => {
      const filePath = pathJoin(this.basePath, agent.path);
      const stats = statSync(filePath);
      return {
        item: agent,
        updatedAt: stats.mtimeMs,
      };
    });
  }

  async updateAgent(agent: Agent, _updatedAt?: number): Promise<Agent> {
    await AgentFactory.write(this.basePath, agent.name, agent);
    return agent;
  }

  // Rules
  async getRule(name: string): Promise<Rule> {
    return RuleFactory.load(this.basePath, name);
  }

  async listRules(): Promise<Rule[]> {
    return RuleFactory.list(this.basePath);
  }

  async listRulesWithTimestamps(): Promise<Array<{ item: Rule; updatedAt: number }>> {
    const { statSync } = await import('fs');
    const rules = await RuleFactory.list(this.basePath);

    return rules.map(rule => {
      const filePath = pathJoin(this.basePath, rule.path);
      const stats = statSync(filePath);
      return {
        item: rule,
        updatedAt: stats.mtimeMs,
      };
    });
  }

  async updateRule(rule: Rule, _updatedAt?: number): Promise<Rule> {
    await RuleFactory.write(this.basePath, rule.name, rule);
    return rule;
  }

  // Workflows
  async getWorkflow(name: string): Promise<Workflow> {
    return WorkflowFactory.load(this.basePath, name);
  }

  async listWorkflows(): Promise<Workflow[]> {
    return WorkflowFactory.list(this.basePath);
  }

  async listWorkflowsWithTimestamps(): Promise<Array<{ item: Workflow; updatedAt: number }>> {
    const { statSync } = await import('fs');
    const workflows = await WorkflowFactory.list(this.basePath);

    return workflows.map(workflow => {
      const filePath = pathJoin(this.basePath, workflow.path);
      const stats = statSync(filePath);
      return {
        item: workflow,
        updatedAt: stats.mtimeMs,
      };
    });
  }

  async updateWorkflow(workflow: Workflow, _updatedAt?: number): Promise<Workflow> {
    await WorkflowFactory.write(this.basePath, workflow.name, workflow);
    return workflow;
  }

  close(): void {
    // No resources to cleanup for filesystem backend
  }
}
