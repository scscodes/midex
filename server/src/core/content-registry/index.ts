import { resolveConfig } from './lib/config.js';
import { FilesystemBackend } from './lib/storage/filesystem-backend.js';
import { DatabaseBackend } from './lib/storage/database-backend.js';
import type { ContentBackend } from './lib/storage/interface.js';
import type { Agent } from './agents/schema.js';
import type { Rule } from './rules/schema.js';
import type { Workflow } from './workflows/schema.js';

/**
 * Content Registry configuration options
 */
export interface ContentRegistryOptions {
  backend?: 'filesystem' | 'database';
  basePath?: string;
  databasePath?: string;
}

/**
 * Workflow search criteria
 */
export interface WorkflowCriteria {
  tags?: string[];
  keywords?: string[];
  complexity?: 'simple' | 'moderate' | 'high';
}

/**
 * Content Registry - Unified API for content management
 *
 * Provides access to agents, rules, and workflows with dual-mode storage
 * (filesystem or database).
 */
export class ContentRegistry {
  private constructor(private readonly backend: ContentBackend) {}

  /**
   * Initialize content registry with specified backend
   */
  static async init(options?: ContentRegistryOptions): Promise<ContentRegistry> {
    const config = resolveConfig(options);

    if (config.backend === 'database') {
      const backend = await DatabaseBackend.create(config.databasePath!);
      return new ContentRegistry(backend);
    }

    // Default to filesystem backend
    const backend = new FilesystemBackend(config.basePath!);
    return new ContentRegistry(backend);
  }

  /**
   * Close the content registry and release resources
   */
  close(): void {
    this.backend.close();
  }

  // Agents
  getAgent(name: string): Promise<Agent> {
    return this.backend.getAgent(name);
  }

  listAgents(): Promise<Agent[]> {
    return this.backend.listAgents();
  }

  async updateAgent(agent: Agent): Promise<Agent> {
    return this.backend.updateAgent(agent);
  }

  // Rules
  getRule(name: string): Promise<Rule> {
    return this.backend.getRule(name);
  }

  listRules(): Promise<Rule[]> {
    return this.backend.listRules();
  }

  getRulesByTag(tags: string[]): Promise<Rule[]> {
    return this.listRules().then(rules => rules.filter(r => tags.every(t => r.tags.includes(t))));
  }

  async updateRule(rule: Rule): Promise<Rule> {
    return this.backend.updateRule(rule);
  }

  // Workflows
  getWorkflow(name: string): Promise<Workflow> {
    return this.backend.getWorkflow(name);
  }

  listWorkflows(): Promise<Workflow[]> {
    return this.backend.listWorkflows();
  }

  findWorkflows(criteria: WorkflowCriteria): Promise<Workflow[]> {
    return this.listWorkflows().then(ws => ws.filter(w => {
      if (criteria.tags && criteria.tags.length > 0) {
        if (!criteria.tags.every(t => w.tags.includes(t))) return false;
      }
      if (criteria.keywords && criteria.keywords.length > 0) {
        const body = `${w.name} ${w.description} ${w.content}`.toLowerCase();
        if (!criteria.keywords.some(k => body.includes(k.toLowerCase()))) return false;
      }
      if (criteria.complexity) {
        if (w.complexity !== criteria.complexity) return false;
      }
      return true;
    }));
  }

  async updateWorkflow(workflow: Workflow): Promise<Workflow> {
    return this.backend.updateWorkflow(workflow);
  }
}

// Public exports - only what consumers need
export type { Agent } from './agents/schema.js';
export type { Rule } from './rules/schema.js';
export type { Workflow } from './workflows/schema.js';
export type {
  ExecutionMode,
  RetryPolicy,
  AgentTaskDefinition,
  StepDefinition
} from './workflows/execution-schema.js';
export type { Triggers } from './lib/shared-schemas.js';
export * from './errors.js';
export * from './lib/sync/index.js';
