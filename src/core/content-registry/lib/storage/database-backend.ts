import type { ContentBackend } from './interface';
import type { Agent } from '../../agents/schema';
import type { Rule } from '../../rules/schema';
import type { Workflow } from '../../workflows/schema';
import { NotFoundError } from '../../errors';
import { initDatabase } from '../../../database';
import { computeContentHash } from '../content/hash';

interface DbAgent {
  name: string;
  description: string;
  content: string;
  tags: string; // JSON array
  version: string | null;
  path: string | null;
  file_hash: string | null;
  updated_at: string;
}

interface DbRule {
  name: string;
  description: string;
  content: string;
  globs: string; // JSON array
  always_apply: number; // 0 or 1
  tags: string; // JSON array
  path: string | null;
  file_hash: string | null;
  updated_at: string;
}

interface DbWorkflow {
  name: string;
  description: string;
  content: string;
  tags: string; // JSON array
  triggers: string; // JSON object
  complexity_hint: string | null;
  path: string | null;
  file_hash: string | null;
  updated_at: string;
}

// Helper functions to convert DB rows to domain types
function dbAgentToAgent(row: DbAgent): Agent {
  return {
    name: row.name,
    description: row.description,
    content: row.content,
    metadata: {
      tags: row.tags ? JSON.parse(row.tags) : [],
      version: row.version || undefined,
    },
    path: row.path || `agents/${row.name}.md`,
    fileHash: row.file_hash || undefined,
  };
}

function dbRuleToRule(row: DbRule): Rule {
  return {
    name: row.name,
    description: row.description,
    content: row.content,
    globs: row.globs ? JSON.parse(row.globs) : [],
    alwaysApply: row.always_apply === 1,
    tags: row.tags ? JSON.parse(row.tags) : [],
    path: row.path || `rules/${row.name}.md`,
    fileHash: row.file_hash || undefined,
  };
}

function dbWorkflowToWorkflow(row: DbWorkflow): Workflow {
  return {
    name: row.name,
    description: row.description,
    content: row.content,
    tags: row.tags ? JSON.parse(row.tags) : [],
    triggers: row.triggers ? JSON.parse(row.triggers) : undefined,
    complexityHint: row.complexity_hint as 'simple' | 'moderate' | 'high' | undefined,
    steps: [], // Steps parsed from content in future implementation
    path: row.path || `workflows/${row.name}.md`,
    fileHash: row.file_hash || undefined,
  };
}

export class DatabaseBackend implements ContentBackend {
  private db;

  constructor(databasePath: string) {
    this.db = initDatabase({ path: databasePath });
    // Schema is now managed by migrations in AppDatabase
  }

  // Agents
  async getAgent(name: string): Promise<Agent> {
    const stmt = this.db.prepare('SELECT * FROM agents WHERE name = ?');
    const row = stmt.get(name) as DbAgent | undefined;

    if (!row) {
      throw new NotFoundError('agent', name);
    }

    return dbAgentToAgent(row);
  }

  async listAgents(): Promise<Agent[]> {
    const stmt = this.db.prepare('SELECT * FROM agents');
    const rows = stmt.all() as DbAgent[];
    return rows.map(dbAgentToAgent);
  }

  async listAgentsWithTimestamps(): Promise<Array<{ item: Agent; updatedAt: number }>> {
    const stmt = this.db.prepare('SELECT * FROM agents');
    const rows = stmt.all() as DbAgent[];

    return rows.map(row => ({
      item: dbAgentToAgent(row),
      updatedAt: new Date(row.updated_at).getTime(),
    }));
  }

  async updateAgent(agent: Agent, updatedAt?: number): Promise<Agent> {
    const fileHash = computeContentHash(agent.content + agent.description);
    const tagsJson = JSON.stringify(agent.metadata?.tags || []);
    const now = updatedAt ? new Date(updatedAt).toISOString() : new Date().toISOString();

    const stmt = this.db.prepare(`
      INSERT INTO agents (name, description, content, tags, version, path, file_hash, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(name) DO UPDATE SET
        description = excluded.description,
        content = excluded.content,
        tags = excluded.tags,
        version = excluded.version,
        path = excluded.path,
        file_hash = excluded.file_hash,
        updated_at = excluded.updated_at
    `);

    stmt.run(
      agent.name,
      agent.description,
      agent.content,
      tagsJson,
      agent.metadata?.version || null,
      agent.path,
      fileHash,
      now
    );

    return { ...agent, fileHash };
  }

  // Rules
  async getRule(name: string): Promise<Rule> {
    const stmt = this.db.prepare('SELECT * FROM rules WHERE name = ?');
    const row = stmt.get(name) as DbRule | undefined;

    if (!row) {
      throw new NotFoundError('rule', name);
    }

    return dbRuleToRule(row);
  }

  async listRules(): Promise<Rule[]> {
    const stmt = this.db.prepare('SELECT * FROM rules');
    const rows = stmt.all() as DbRule[];
    return rows.map(dbRuleToRule);
  }

  async listRulesWithTimestamps(): Promise<Array<{ item: Rule; updatedAt: number }>> {
    const stmt = this.db.prepare('SELECT * FROM rules');
    const rows = stmt.all() as DbRule[];

    return rows.map(row => ({
      item: dbRuleToRule(row),
      updatedAt: new Date(row.updated_at).getTime(),
    }));
  }

  async updateRule(rule: Rule, updatedAt?: number): Promise<Rule> {
    const fileHash = computeContentHash(rule.content + rule.description);
    const globsJson = JSON.stringify(rule.globs || []);
    const tagsJson = JSON.stringify(rule.tags || []);
    const now = updatedAt ? new Date(updatedAt).toISOString() : new Date().toISOString();

    const stmt = this.db.prepare(`
      INSERT INTO rules (name, description, content, globs, always_apply, tags, path, file_hash, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(name) DO UPDATE SET
        description = excluded.description,
        content = excluded.content,
        globs = excluded.globs,
        always_apply = excluded.always_apply,
        tags = excluded.tags,
        path = excluded.path,
        file_hash = excluded.file_hash,
        updated_at = excluded.updated_at
    `);

    stmt.run(
      rule.name,
      rule.description,
      rule.content,
      globsJson,
      rule.alwaysApply ? 1 : 0,
      tagsJson,
      rule.path,
      fileHash,
      now
    );

    return { ...rule, fileHash };
  }

  // Workflows
  async getWorkflow(name: string): Promise<Workflow> {
    const stmt = this.db.prepare('SELECT * FROM workflows WHERE name = ?');
    const row = stmt.get(name) as DbWorkflow | undefined;

    if (!row) {
      throw new NotFoundError('workflow', name);
    }

    return dbWorkflowToWorkflow(row);
  }

  async listWorkflows(): Promise<Workflow[]> {
    const stmt = this.db.prepare('SELECT * FROM workflows');
    const rows = stmt.all() as DbWorkflow[];
    return rows.map(dbWorkflowToWorkflow);
  }

  async listWorkflowsWithTimestamps(): Promise<Array<{ item: Workflow; updatedAt: number }>> {
    const stmt = this.db.prepare('SELECT * FROM workflows');
    const rows = stmt.all() as DbWorkflow[];

    return rows.map(row => ({
      item: dbWorkflowToWorkflow(row),
      updatedAt: new Date(row.updated_at).getTime(),
    }));
  }

  async updateWorkflow(workflow: Workflow, updatedAt?: number): Promise<Workflow> {
    const fileHash = computeContentHash(workflow.content + workflow.description);
    const tagsJson = JSON.stringify(workflow.tags || []);
    const triggersJson = workflow.triggers ? JSON.stringify(workflow.triggers) : null;
    const now = updatedAt ? new Date(updatedAt).toISOString() : new Date().toISOString();

    const stmt = this.db.prepare(`
      INSERT INTO workflows (name, description, content, tags, triggers, complexity_hint, path, file_hash, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(name) DO UPDATE SET
        description = excluded.description,
        content = excluded.content,
        tags = excluded.tags,
        triggers = excluded.triggers,
        complexity_hint = excluded.complexity_hint,
        path = excluded.path,
        file_hash = excluded.file_hash,
        updated_at = excluded.updated_at
    `);

    stmt.run(
      workflow.name,
      workflow.description,
      workflow.content,
      tagsJson,
      triggersJson,
      workflow.complexityHint || null,
      workflow.path,
      fileHash,
      now
    );

    return { ...workflow, fileHash };
  }

  close(): void {
    this.db.close();
  }
}
