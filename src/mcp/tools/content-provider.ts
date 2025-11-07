/**
 * MCP Content Provider Tools
 * Provides discovery and retrieval of workflows, agents, rules, and project context
 */

import type { ContentRegistry } from '../../core/content-registry';
import type { Agent, Rule, Workflow } from '../../core/content-registry';
import type { Database as DB } from 'better-sqlite3';

export type DetailLevel = 'name' | 'summary' | 'full';
export type ContentMode = 'normalized' | 'raw' | 'synthesized' | 'mixed';
export type RedactPolicy = 'none' | 'pii' | 'secrets' | 'pii+secrets';

/**
 * Common response structure for content items
 */
interface ContentResponse<T> {
  item: T;
  metadata: {
    fileHash?: string;
    updatedAt: string;
    path?: string;
  };
}

/**
 * Content Provider Tools implementation
 */
export class ContentProviderTools {
  constructor(
    private registry: ContentRegistry,
    private db: DB
  ) {}

  /**
   * Search workflows by tags, keywords, or complexity
   */
  async searchWorkflows(params: {
    tags?: string[];
    keywords?: string[];
    complexity?: 'simple' | 'moderate' | 'high';
    detailLevel?: DetailLevel;
    page?: number;
    limit?: number;
  }): Promise<ContentResponse<Workflow>[]> {
    const {
      tags,
      keywords,
      complexity,
      detailLevel = 'summary',
      page = 1,
      limit = 50,
    } = params;

    // Find matching workflows
    const workflows = await this.registry.findWorkflows({
      tags,
      keywords,
      complexity,
    });

    // Apply pagination
    const offset = (page - 1) * limit;
    const paged = workflows.slice(offset, offset + limit);

    // Format responses based on detail level
    return paged.map(wf => this.formatWorkflow(wf, detailLevel));
  }

  /**
   * List all discovered projects
   */
  async listProjects(params: {
    page?: number;
    limit?: number;
  }): Promise<Array<{
    id: number;
    name: string;
    path: string;
    isGitRepo: boolean;
    metadata: Record<string, unknown> | null;
    discoveredAt: string;
    lastUsedAt: string;
  }>> {
    const { page = 1, limit = 50 } = params;
    const offset = (page - 1) * limit;

    const stmt = this.db.prepare(`
      SELECT * FROM project_associations
      ORDER BY last_used_at DESC
      LIMIT ? OFFSET ?
    `);

    const rows = stmt.all(limit, offset) as any[];

    return rows.map(row => ({
      id: row.id,
      name: row.name,
      path: row.path,
      isGitRepo: row.is_git_repo === 1,
      metadata: row.metadata ? JSON.parse(row.metadata) : null,
      discoveredAt: row.discovered_at,
      lastUsedAt: row.last_used_at,
    }));
  }

  /**
   * Get workflow by name with configurable detail level
   */
  async getWorkflow(params: {
    workflowName: string;
    detailLevel?: DetailLevel;
    fields?: string[];
    contentMode?: ContentMode;
    includeHash?: boolean;
    ifNoneMatch?: string;
    redactPolicy?: RedactPolicy;
  }): Promise<ContentResponse<Workflow> | { notModified: true } | null> {
    const {
      workflowName,
      detailLevel = 'summary',
      fields,
      contentMode = 'normalized',
      includeHash = true,
      ifNoneMatch,
      redactPolicy = 'secrets',
    } = params;

    try {
      const workflow = await this.registry.getWorkflow(workflowName);

      // Cache validation - if hash matches, return not modified
      if (ifNoneMatch && workflow.fileHash === ifNoneMatch) {
        return { notModified: true };
      }

      return this.formatWorkflow(workflow, detailLevel, includeHash, contentMode, fields, redactPolicy);
    } catch (error) {
      return null;
    }
  }

  /**
   * Get agent persona by name
   */
  async getAgentPersona(params: {
    agentName: string;
    detailLevel?: DetailLevel;
    fields?: string[];
    contentMode?: ContentMode;
    includeHash?: boolean;
    ifNoneMatch?: string;
    redactPolicy?: RedactPolicy;
  }): Promise<ContentResponse<Agent> | { notModified: true } | null> {
    const {
      agentName,
      detailLevel = 'summary',
      fields,
      contentMode = 'normalized',
      includeHash = true,
      ifNoneMatch,
      redactPolicy = 'secrets',
    } = params;

    try {
      const agent = await this.registry.getAgent(agentName);

      // Cache validation
      if (ifNoneMatch && agent.fileHash === ifNoneMatch) {
        return { notModified: true };
      }

      return this.formatAgent(agent, detailLevel, includeHash, contentMode, fields, redactPolicy);
    } catch (error) {
      return null;
    }
  }

  /**
   * Get relevant rules based on tags, file types, or alwaysApply
   */
  async getRelevantRules(params: {
    tags?: string[];
    fileTypes?: string[];
    alwaysApply?: boolean;
    detailLevel?: DetailLevel;
    fields?: string[];
    contentMode?: ContentMode;
    includeHash?: boolean;
    ifNoneMatch?: string;
    redactPolicy?: RedactPolicy;
    page?: number;
    limit?: number;
  }): Promise<ContentResponse<Rule>[]> {
    const {
      tags,
      fileTypes,
      alwaysApply,
      detailLevel = 'summary',
      fields,
      contentMode = 'normalized',
      includeHash = true,
      redactPolicy = 'secrets',
      page = 1,
      limit = 50,
    } = params;

    let rules = await this.registry.listRules();

    // Filter by tags
    if (tags && tags.length > 0) {
      rules = rules.filter(rule =>
        tags.some(tag => rule.tags.includes(tag))
      );
    }

    // Filter by file types (glob matching)
    if (fileTypes && fileTypes.length > 0) {
      rules = rules.filter(rule =>
        fileTypes.some(ft =>
          rule.globs.some(glob => this.matchGlob(ft, glob))
        )
      );
    }

    // Filter by alwaysApply
    if (alwaysApply !== undefined) {
      rules = rules.filter(rule => rule.alwaysApply === alwaysApply);
    }

    // Pagination
    const offset = (page - 1) * limit;
    const paged = rules.slice(offset, offset + limit);

    return paged.map(rule => this.formatRule(rule, detailLevel, includeHash, contentMode, fields, redactPolicy));
  }

  /**
   * Get project context (discovers or retrieves existing project)
   */
  async getProjectContext(params: {
    projectPath?: string;
  }): Promise<{
    id: number;
    name: string;
    path: string;
    isGitRepo: boolean;
    metadata: Record<string, unknown> | null;
  } | null> {
    const { projectPath = process.cwd() } = params;

    // Try to find existing project
    const stmt = this.db.prepare(`
      SELECT * FROM project_associations WHERE path = ?
    `);

    const row = stmt.get(projectPath) as any;

    if (row) {
      return {
        id: row.id,
        name: row.name,
        path: row.path,
        isGitRepo: row.is_git_repo === 1,
        metadata: row.metadata ? JSON.parse(row.metadata) : null,
      };
    }

    return null;
  }

  // Formatting helpers

  private formatWorkflow(
    workflow: Workflow,
    detailLevel: DetailLevel,
    includeHash: boolean = true,
    contentMode: ContentMode = 'normalized',
    fields?: string[],
    redactPolicy: RedactPolicy = 'secrets'
  ): ContentResponse<Workflow> {
    let item: Workflow;

    if (detailLevel === 'name') {
      // Only name and basic metadata
      item = {
        name: workflow.name,
        description: '',
        content: '',
        tags: [],
        triggers: workflow.triggers,
        complexity: workflow.complexity,
        phases: [],
        path: workflow.path,
        fileHash: workflow.fileHash,
      };
    } else if (detailLevel === 'summary') {
      // Name, description, metadata, no content
      item = {
        ...workflow,
        content: '',
      };
    } else {
      // Full content
      item = { ...workflow };

      // Apply contentMode
      if (contentMode === 'raw') {
        // Return as-is (raw markdown)
      } else if (contentMode === 'normalized') {
        // Already normalized in schema
      }

      // Apply redaction
      if (redactPolicy !== 'none') {
        item.content = this.redactContent(item.content, redactPolicy);
      }
    }

    // Apply fields filter
    if (fields && fields.length > 0) {
      item = this.filterFields(item, fields) as Workflow;
    }

    return {
      item,
      metadata: {
        fileHash: includeHash ? workflow.fileHash : undefined,
        updatedAt: new Date().toISOString(),
        path: workflow.path,
      },
    };
  }

  private formatAgent(
    agent: Agent,
    detailLevel: DetailLevel,
    includeHash: boolean = true,
    contentMode: ContentMode = 'normalized',
    fields?: string[],
    redactPolicy: RedactPolicy = 'secrets'
  ): ContentResponse<Agent> {
    let item: Agent;

    if (detailLevel === 'name') {
      item = {
        name: agent.name,
        description: '',
        content: '',
        path: agent.path,
        metadata: agent.metadata,
        fileHash: agent.fileHash,
      };
    } else if (detailLevel === 'summary') {
      item = {
        ...agent,
        content: '',
      };
    } else {
      item = { ...agent };

      // Apply contentMode
      if (contentMode === 'raw') {
        // Return as-is
      } else if (contentMode === 'normalized') {
        // Already normalized
      }

      // Apply redaction
      if (redactPolicy !== 'none') {
        item.content = this.redactContent(item.content, redactPolicy);
      }
    }

    // Apply fields filter
    if (fields && fields.length > 0) {
      item = this.filterFields(item, fields) as Agent;
    }

    return {
      item,
      metadata: {
        fileHash: includeHash ? agent.fileHash : undefined,
        updatedAt: new Date().toISOString(),
        path: agent.path,
      },
    };
  }

  private formatRule(
    rule: Rule,
    detailLevel: DetailLevel,
    includeHash: boolean = true,
    contentMode: ContentMode = 'normalized',
    fields?: string[],
    redactPolicy: RedactPolicy = 'secrets'
  ): ContentResponse<Rule> {
    let item: Rule;

    if (detailLevel === 'name') {
      item = {
        name: rule.name,
        description: '',
        content: '',
        globs: rule.globs,
        alwaysApply: rule.alwaysApply,
        tags: [],
        path: rule.path,
        fileHash: rule.fileHash,
      };
    } else if (detailLevel === 'summary') {
      item = {
        ...rule,
        content: '',
      };
    } else {
      item = { ...rule };

      // Apply contentMode
      if (contentMode === 'raw') {
        // Return as-is
      } else if (contentMode === 'normalized') {
        // Already normalized
      }

      // Apply redaction
      if (redactPolicy !== 'none') {
        item.content = this.redactContent(item.content, redactPolicy);
      }
    }

    // Apply fields filter
    if (fields && fields.length > 0) {
      item = this.filterFields(item, fields) as Rule;
    }

    return {
      item,
      metadata: {
        fileHash: includeHash ? rule.fileHash : undefined,
        updatedAt: new Date().toISOString(),
        path: rule.path,
      },
    };
  }

  /**
   * Redact sensitive content based on policy
   */
  private redactContent(content: string, policy: RedactPolicy): string {
    let redacted = content;

    if (policy === 'secrets' || policy === 'pii+secrets') {
      // Redact common secret patterns
      redacted = redacted
        .replace(/(['"])?[A-Za-z0-9_-]{20,}(['"])?/g, '[REDACTED_SECRET]') // API keys
        .replace(/sk-[A-Za-z0-9]{48}/g, '[REDACTED_API_KEY]') // OpenAI keys
        .replace(/ghp_[A-Za-z0-9]{36}/g, '[REDACTED_GITHUB_TOKEN]') // GitHub tokens
        .replace(/password\s*=\s*["'].*?["']/gi, 'password=[REDACTED]') // Passwords
        .replace(/token\s*=\s*["'].*?["']/gi, 'token=[REDACTED]'); // Tokens
    }

    if (policy === 'pii' || policy === 'pii+secrets') {
      // Redact PII patterns
      redacted = redacted
        .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[REDACTED_EMAIL]') // Emails
        .replace(/\b\d{3}-\d{2}-\d{4}\b/g, '[REDACTED_SSN]') // SSN
        .replace(/\b\d{16}\b/g, '[REDACTED_CREDIT_CARD]'); // Credit cards
    }

    return redacted;
  }

  /**
   * Filter object to only include specified fields
   */
  private filterFields<T extends Record<string, any>>(obj: T, fields: string[]): Partial<T> {
    const filtered: any = {};
    for (const field of fields) {
      if (field in obj) {
        filtered[field] = obj[field];
      }
    }
    return filtered;
  }

  /**
   * Simple glob matcher (basic implementation)
   */
  private matchGlob(str: string, pattern: string): boolean {
    const regexPattern = pattern
      .replace(/\./g, '\\.')
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.');
    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(str);
  }
}
