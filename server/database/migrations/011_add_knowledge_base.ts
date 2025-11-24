import type { Migration } from './types.js';

/**
 * Add knowledge base tables for long-lived cross-project findings.
 *
 * Creates structured storage plus FTS for quick retrieval:
 * - knowledge_findings: Persistent records with scope + lineage
 * - knowledge_findings_fts: Search accelerator
 */
const migration: Migration = {
  version: 11,
  name: 'add_knowledge_base',
  destructive: false,

  up: (db) => {
    // ============================================================================
    // KNOWLEDGE FINDINGS - Long-lived insights
    // ============================================================================
    db.exec(`
      CREATE TABLE IF NOT EXISTS knowledge_findings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        scope TEXT NOT NULL CHECK(scope IN ('global', 'project', 'system')),
        project_id INTEGER,
        category TEXT NOT NULL CHECK(category IN ('security', 'architecture', 'performance', 'constraint', 'pattern')),
        severity TEXT NOT NULL CHECK(severity IN ('info', 'low', 'medium', 'high', 'critical')),
        status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'deprecated')),
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        tags TEXT CHECK(tags IS NULL OR json_valid(tags)),
        source_execution_id TEXT,
        source_agent TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

        FOREIGN KEY (project_id) REFERENCES project_associations(id) ON DELETE CASCADE,
        FOREIGN KEY (source_execution_id) REFERENCES workflow_executions_v2(execution_id) ON DELETE SET NULL,
        CHECK(length(title) > 0),
        CHECK(length(content) > 0),
        CHECK(scope != 'project' OR project_id IS NOT NULL)
      );

      CREATE INDEX IF NOT EXISTS idx_knowledge_findings_scope ON knowledge_findings(scope);
      CREATE INDEX IF NOT EXISTS idx_knowledge_findings_project ON knowledge_findings(project_id);
      CREATE INDEX IF NOT EXISTS idx_knowledge_findings_category ON knowledge_findings(category);
      CREATE INDEX IF NOT EXISTS idx_knowledge_findings_severity ON knowledge_findings(severity);
      CREATE INDEX IF NOT EXISTS idx_knowledge_findings_status ON knowledge_findings(status);
    `);

    // ============================================================================
    // FTS TABLE - Fast search
    // ============================================================================
    db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS knowledge_findings_fts USING fts5(
        finding_id UNINDEXED,
        title,
        content,
        tags,
        category,
        scope,
        content='knowledge_findings',
        content_rowid='id'
      );
    `);

    // ============================================================================
    // TRIGGERS - Keep FTS + timestamps in sync
    // ============================================================================
    db.exec(`
      CREATE TRIGGER IF NOT EXISTS trg_knowledge_findings_insert
        AFTER INSERT ON knowledge_findings
      BEGIN
        INSERT INTO knowledge_findings_fts(rowid, finding_id, title, content, tags, category, scope)
        VALUES (new.id, new.id, new.title, new.content, COALESCE(new.tags, '[]'), new.category, new.scope);
      END;

      CREATE TRIGGER IF NOT EXISTS trg_knowledge_findings_delete
        AFTER DELETE ON knowledge_findings
      BEGIN
        DELETE FROM knowledge_findings_fts WHERE rowid = old.id;
      END;

      CREATE TRIGGER IF NOT EXISTS trg_knowledge_findings_update
        AFTER UPDATE ON knowledge_findings
      BEGIN
        DELETE FROM knowledge_findings_fts WHERE rowid = old.id;
        INSERT INTO knowledge_findings_fts(rowid, finding_id, title, content, tags, category, scope)
        VALUES (new.id, new.id, new.title, new.content, COALESCE(new.tags, '[]'), new.category, new.scope);
      END;

      CREATE TRIGGER IF NOT EXISTS trg_knowledge_findings_updated_at
        AFTER UPDATE ON knowledge_findings
        FOR EACH ROW
      BEGIN
        UPDATE knowledge_findings
        SET updated_at = CURRENT_TIMESTAMP
        WHERE id = old.id;
      END;
    `);
  },

  down: (db) => {
    db.exec(`
      DROP TRIGGER IF EXISTS trg_knowledge_findings_updated_at;
      DROP TRIGGER IF EXISTS trg_knowledge_findings_update;
      DROP TRIGGER IF EXISTS trg_knowledge_findings_delete;
      DROP TRIGGER IF EXISTS trg_knowledge_findings_insert;
      DROP TABLE IF EXISTS knowledge_findings_fts;
      DROP INDEX IF EXISTS idx_knowledge_findings_status;
      DROP INDEX IF EXISTS idx_knowledge_findings_severity;
      DROP INDEX IF EXISTS idx_knowledge_findings_category;
      DROP INDEX IF EXISTS idx_knowledge_findings_project;
      DROP INDEX IF EXISTS idx_knowledge_findings_scope;
      DROP TABLE IF EXISTS knowledge_findings;
    `);
  },
};

export default migration;

