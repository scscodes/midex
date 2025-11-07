import type { Migration } from './types.js';

/**
 * Normalize tag storage from JSON columns to relational tables
 *
 * Benefits:
 * - Efficient indexing for tag queries
 * - Foreign key constraints ensure referential integrity
 * - Better query performance (no JSON parsing)
 * - Supports tag-based filtering without full table scans
 */
const migration: Migration = {
  version: 2,
  name: 'normalize_tags',
  destructive: false,

  up: (db) => {
    // Agent tags table
    db.exec(`
      CREATE TABLE agent_tags (
        agent_id INTEGER NOT NULL,
        tag TEXT NOT NULL,
        PRIMARY KEY (agent_id, tag),
        FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
      );

      CREATE INDEX idx_agent_tags_tag ON agent_tags(tag);
    `);

    // Rule tags table
    db.exec(`
      CREATE TABLE rule_tags (
        rule_id INTEGER NOT NULL,
        tag TEXT NOT NULL,
        PRIMARY KEY (rule_id, tag),
        FOREIGN KEY (rule_id) REFERENCES rules(id) ON DELETE CASCADE
      );

      CREATE INDEX idx_rule_tags_tag ON rule_tags(tag);
    `);

    // Workflow tags table
    db.exec(`
      CREATE TABLE workflow_tags (
        workflow_id INTEGER NOT NULL,
        tag TEXT NOT NULL,
        PRIMARY KEY (workflow_id, tag),
        FOREIGN KEY (workflow_id) REFERENCES workflows(id) ON DELETE CASCADE
      );

      CREATE INDEX idx_workflow_tags_tag ON workflow_tags(tag);
    `);

    // Migrate existing tags from JSON columns to normalized tables
    // Agent tags
    const agents = db.prepare('SELECT id, tags FROM agents WHERE tags IS NOT NULL').all() as Array<{
      id: number;
      tags: string;
    }>;

    const insertAgentTag = db.prepare('INSERT OR IGNORE INTO agent_tags (agent_id, tag) VALUES (?, ?)');
    for (const agent of agents) {
      try {
        const tags = JSON.parse(agent.tags) as string[];
        for (const tag of tags) {
          insertAgentTag.run(agent.id, tag);
        }
      } catch {
        // Invalid JSON, skip
      }
    }

    // Rule tags
    const rules = db.prepare('SELECT id, tags FROM rules WHERE tags IS NOT NULL').all() as Array<{
      id: number;
      tags: string;
    }>;

    const insertRuleTag = db.prepare('INSERT OR IGNORE INTO rule_tags (rule_id, tag) VALUES (?, ?)');
    for (const rule of rules) {
      try {
        const tags = JSON.parse(rule.tags) as string[];
        for (const tag of tags) {
          insertRuleTag.run(rule.id, tag);
        }
      } catch {
        // Invalid JSON, skip
      }
    }

    // Workflow tags
    const workflows = db.prepare('SELECT id, tags FROM workflows WHERE tags IS NOT NULL').all() as Array<{
      id: number;
      tags: string;
    }>;

    const insertWorkflowTag = db.prepare('INSERT OR IGNORE INTO workflow_tags (workflow_id, tag) VALUES (?, ?)');
    for (const workflow of workflows) {
      try {
        const tags = JSON.parse(workflow.tags) as string[];
        for (const tag of tags) {
          insertWorkflowTag.run(workflow.id, tag);
        }
      } catch {
        // Invalid JSON, skip
      }
    }

    // Note: We keep the JSON columns for backward compatibility during transition
    // They can be removed in a future migration once all code is updated
  },

  down: (db) => {
    db.exec(`
      DROP INDEX IF EXISTS idx_workflow_tags_tag;
      DROP TABLE IF EXISTS workflow_tags;

      DROP INDEX IF EXISTS idx_rule_tags_tag;
      DROP TABLE IF EXISTS rule_tags;

      DROP INDEX IF EXISTS idx_agent_tags_tag;
      DROP TABLE IF EXISTS agent_tags;
    `);
  },
};

export default migration;
