import type { Migration } from './types.js';

/**
 * Add tool_configs table
 * Store AI coding tool configurations (MCP servers, agent rules, hooks)
 */
const migration: Migration = {
  version: 2,
  name: 'add_tool_configs',
  destructive: false,

  up: (db) => {
    // Skip if baseline already applied (tool_configs already exists)
    const baselineApplied = db
      .prepare('SELECT 1 FROM schema_migrations WHERE version = 1 AND name = ?')
      .get('baseline');
    
    if (baselineApplied) {
      return;
    }

    db.exec(`
      -- Create tool_configs table
      CREATE TABLE IF NOT EXISTS tool_configs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        tool_type TEXT NOT NULL CHECK(tool_type IN ('claude-code', 'cursor', 'windsurf', 'vscode', 'intellij')),
        config_type TEXT NOT NULL CHECK(config_type IN ('mcp_servers', 'agent_rules', 'hooks', 'settings')),
        config_level TEXT NOT NULL CHECK(config_level IN ('project', 'user')),
        content TEXT NOT NULL,
        file_path TEXT,
        project_id INTEGER,
        metadata TEXT CHECK(metadata IS NULL OR json_valid(metadata)),
        file_hash TEXT CHECK(file_hash IS NULL OR length(file_hash) <= 64),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (project_id) REFERENCES project_associations(id) ON DELETE CASCADE
      );

      -- Create indexes for efficient querying
      CREATE INDEX IF NOT EXISTS idx_tool_configs_type ON tool_configs(tool_type, config_type);
      CREATE INDEX IF NOT EXISTS idx_tool_configs_project ON tool_configs(project_id);
      CREATE INDEX IF NOT EXISTS idx_tool_configs_level ON tool_configs(config_level);
      CREATE INDEX IF NOT EXISTS idx_tool_configs_hash ON tool_configs(file_hash);

      -- Create trigger to update updated_at timestamp
      CREATE TRIGGER IF NOT EXISTS tool_configs_updated_at
      AFTER UPDATE ON tool_configs
      FOR EACH ROW
      BEGIN
        UPDATE tool_configs SET updated_at = CURRENT_TIMESTAMP WHERE id = OLD.id;
      END;
    `);
  },

  down: (db) => {
    db.exec(`
      -- Drop trigger
      DROP TRIGGER IF EXISTS tool_configs_updated_at;

      -- Drop indexes
      DROP INDEX IF EXISTS idx_tool_configs_hash;
      DROP INDEX IF EXISTS idx_tool_configs_level;
      DROP INDEX IF EXISTS idx_tool_configs_project;
      DROP INDEX IF EXISTS idx_tool_configs_type;

      -- Drop table
      DROP TABLE IF EXISTS tool_configs;
    `);
  },
};

export default migration;
